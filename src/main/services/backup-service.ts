import { app, BrowserWindow, dialog } from 'electron'
import { randomBytes } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { readFile } from 'fs/promises'
import { hostname } from 'os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import Database from 'better-sqlite3'
import { log } from '../core/logger'
import type { AsyncZippable, Unzipped } from 'fflate'
import { unzipAsync, zipAsync } from '../core/zip'
import { z } from 'zod'
import type { BackupApi } from '@shared/api'
import {
  EXPORT_FORMATS,
  type BackupEntry,
  type BackupFolderInfo,
  type StorageFreed
} from '@shared/domain/system'
import type { DbContext } from '../db/client'
import type { AppPaths } from '../core/paths'
import type { ConfigStore } from '../core/config-store'
import type { EventBus } from '../core/event-bus'
import type { SearchIndex } from './search-index'
import type { ExportService } from './export-service'
import { showNotification } from '../core/notify'
import { openPathOrThrow } from '../core/open-path'
import { removeFiles } from '../core/remove-files'
import { DAY_MS, dayKey, now, retryBusy, UserError } from '../core/util'
import {
  BackupCheckError,
  databaseRows,
  DB_ENTRY,
  filesFacts,
  MANIFEST,
  readBackupFacts,
  verifyBackup,
  type BackupFacts
} from './backup-verify'
import {
  assertUsableFolder,
  assertWritable,
  BACKUP_EXT,
  copyName,
  exists,
  folderErrorMessage,
  machineTag,
  removeOwnCopy,
  rotateCopies,
  writeCopy,
  type MachineTag
} from './backup-folder'

/** A regular backup in Vault's own folder (not «pre-restore»): the one «Папка для копій» receives. */
const REGULAR = new RegExp(`^vault-(\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2})\\.${BACKUP_EXT}$`)
/** Safety copies made right before a restore («vault-pre-restore-…»): the newest few are enough. */
const PRE_RESTORE_KEEP = 3
/** «Сховище → Видалити старі» keeps only the newest safety copy: they are the largest files (with all files). */
const MANUAL_PRE_RESTORE_KEEP = 1
/** A «.part» older than this was left by a quit mid-write: no backup is written for so long. */
const STALE_PART_MS = 60 * 60_000
/** Where to find the error log, in the words of the settings page. */
const LOG_HINT = 'Налаштування → Дані → «Відкрити журнал»'
const STORE_ONLY = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|zip)$/i

interface Manifest {
  format: 'vault-backup'
  version: 1
  appVersion: string
  createdAt: number
}

/** Recursively collects files under root as { 'prefix/rel/path': [bytes, opts] }. */
export function collectFiles(
  root: string,
  prefix: string,
  out: AsyncZippable = {},
  dir = root
): AsyncZippable {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) collectFiles(root, prefix, out, abs)
    else {
      out[`${prefix}/${relative(root, abs).split(sep).join('/')}`] = [
        readFileSync(abs),
        { level: STORE_ONLY.test(name) ? 0 : 6 }
      ]
    }
  }
  return out
}

/** One-file backups (DB + files folder in a zip), daily auto-backup with rotation, restore. */
export class BackupService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  /** A restore is swapping the database: no second restore, no auto-backup meanwhile. */
  private restoring = false
  /** Day a failed auto-backup was last reported: once a day is enough, the hourly retry stays silent. */
  private failNotifiedDay: string | null = null
  /** The same for «Папка для копій»: an unplugged disk is retried every hour, reported once a day. */
  private folderFailNotifiedDay: string | null = null
  /** The copy to the folder in progress: one at a time, a second call waits for it. */
  private folderJob: Promise<void> | null = null
  /** Facts of the newest regular backup, so its folder copy is checked against the snapshot it came from. */
  private factsOf: { fileName: string; facts: BackupFacts } | null = null

  constructor(
    private readonly ctx: DbContext,
    private readonly paths: AppPaths,
    private readonly config: ConfigStore,
    private readonly search: SearchIndex,
    private readonly bus: EventBus,
    /** `folderCopies: false` — «Тестовий режим»: test data never goes to an outside folder. */
    private readonly opts: { folderCopies: boolean; hostname?: string } = { folderCopies: true }
  ) {}

  list(): BackupEntry[] {
    if (!existsSync(this.paths.backupsDir)) return []
    return readdirSync(this.paths.backupsDir)
      .filter((f) => f.endsWith(`.${BACKUP_EXT}`))
      .map((fileName) => {
        const path = join(this.paths.backupsDir, fileName)
        const st = statSync(path)
        return { fileName, path, size: st.size, createdAt: st.mtimeMs }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  private stamp(): string {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  }

  /** Builds the backup archive bytes and the facts its copies are checked against (rows per table, files). */
  async build(): Promise<{ bytes: Uint8Array; facts: BackupFacts }> {
    const tmpDb = join(this.paths.tmpDir, `backup-${Date.now()}.db`)
    try {
      await this.ctx.backupTo(tmpDb)
      const manifest: Manifest = {
        format: 'vault-backup',
        version: 1,
        appVersion: app.getVersion(),
        createdAt: now()
      }
      const entries: AsyncZippable = {
        [MANIFEST]: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
        [DB_ENTRY]: readFileSync(tmpDb)
      }
      collectFiles(this.paths.filesDir, 'files', entries)
      const files: Record<string, Uint8Array> = {}
      for (const [name, value] of Object.entries(entries))
        files[name] = Array.isArray(value) ? (value[0] as Uint8Array) : (value as Uint8Array)
      // Counted on the snapshot itself: a broken live database fails here, before any old copy is rotated out.
      let rows: BackupFacts['rows']
      try {
        rows = databaseRows(tmpDb)
      } catch (e) {
        log.error('[backup] the database snapshot failed the check', e)
        throw new UserError(
          `База даних не пройшла перевірку — бекап не зроблено, попередні копії не змінено. Подробиці — у журналі: ${LOG_HINT}.`
        )
      }
      const facts: BackupFacts = { rows, files: filesFacts(files) }
      return { bytes: await zipAsync(entries, { level: 6 }), facts }
    } finally {
      rmSync(tmpDb, { force: true })
    }
  }

  /**
   * `trigger` — who asked: «Зробити бекап зараз» (manual: the folder copy reports its result) or the daily check.
   * A regular backup (not «Зберегти у файл», not the copy before a restore) then goes to «Папка для копій» too.
   */
  async create(
    opts: { saveAs: boolean; label?: string },
    trigger: 'manual' | 'auto' = 'manual'
  ): Promise<BackupEntry | null> {
    if (this.running) throw new UserError('Бекап уже виконується')
    this.running = true
    let entry: BackupEntry
    try {
      const fileName = `vault-${opts.label ? opts.label + '-' : ''}${this.stamp()}.${BACKUP_EXT}`
      let target = join(this.paths.backupsDir, fileName)
      if (opts.saveAs) {
        const res = await dialog.showSaveDialog(this.parent(), {
          title: 'Зберегти бекап',
          defaultPath: join(app.getPath('documents'), fileName),
          filters: [{ name: 'Vault backup', extensions: [BACKUP_EXT] }]
        })
        if (res.canceled || !res.filePath) return null
        target = res.filePath
      }
      const facts = await this.writeArchive(target)
      // Read back from disk and checked before it may push an older copy out of the rotation.
      await this.checkWritten(target, facts)
      this.config.lastBackupAt = now()
      if (!opts.saveAs) this.prune()
      if (!opts.saveAs && !opts.label) this.factsOf = { fileName, facts }
      const st = statSync(target)
      entry = {
        fileName: target.split(/[\\/]/).pop()!,
        path: target,
        size: st.size,
        createdAt: st.mtimeMs
      }
    } finally {
      this.running = false
    }
    // Not awaited: a slow cloud folder or an unplugged disk never holds the backup itself.
    if (!opts.saveAs && !opts.label) void this.syncFolder(trigger)
    return entry
  }

  /** Builds and writes the archive (aside, then renamed); the bytes go out of scope before the read-back. */
  private async writeArchive(target: string): Promise<BackupFacts> {
    const { bytes, facts } = await this.build()
    mkdirSync(dirname(target), { recursive: true })
    // Written aside and renamed: a full disk or a quit mid-write leaves a «.part» (list() skips it),
    // not a truncated backup that looks fine and takes a rotation slot.
    const part = `${target}.part`
    try {
      writeFileSync(part, bytes)
      renameSync(part, target)
    } catch (e) {
      rmSync(part, { force: true })
      throw e
    }
    return facts
  }

  /** A backup that doesn't read back as its snapshot is removed: a bad copy is worse than none. */
  private async checkWritten(target: string, facts: BackupFacts): Promise<void> {
    try {
      await verifyBackup(readFileSync(target), facts, this.paths.tmpDir)
    } catch (e) {
      rmSync(target, { force: true })
      log.error('[backup] the new backup failed the check and was removed', target, e)
      throw new UserError(
        `Бекап не пройшов перевірку й не збережений — попередні копії не змінено. Подробиці — у журналі: ${LOG_HINT}.`
      )
    }
  }

  /**
   * Keeps the newest `backupKeep` regular backups and the 3 newest safety copies made before a restore.
   * Also removes «.part» files a quit mid-write left behind (backups folder only, never a «Зберегти як…» folder).
   */
  private prune(): void {
    const all = this.list()
    const pre = all.filter((b) => b.fileName.includes('-pre-restore-'))
    const auto = all.filter((b) => !b.fileName.includes('-pre-restore-'))
    for (const b of [
      ...auto.slice(this.config.settings.backupKeep),
      ...pre.slice(PRE_RESTORE_KEEP)
    ]) {
      rmSync(b.path, { force: true })
    }
    for (const f of readdirSync(this.paths.backupsDir)) {
      if (!f.endsWith(`.${BACKUP_EXT}.part`)) continue
      const part = join(this.paths.backupsDir, f)
      if (now() - statSync(part).mtimeMs > STALE_PART_MS) rmSync(part, { force: true })
    }
  }

  /** A backup or a restore is running: files in the backups folder must not be removed meanwhile. */
  isBusy(): boolean {
    return this.running || this.restoring
  }

  /**
   * What «Видалити старі» (Налаштування → Сховище) removes: regular backups beyond `backupKeep`, safety
   * copies before a restore beyond the newest one, and stale «.part» files. Never the pre-update copies of
   * the database (insurance before migrations) and never files Vault did not write.
   */
  prunePlan(): { path: string; size: number }[] {
    const all = this.list()
    const pre = all.filter((b) => b.fileName.startsWith('vault-pre-restore-'))
    const regular = all.filter(
      (b) => b.fileName.startsWith('vault-') && !b.fileName.includes('-pre-restore-')
    )
    const plan = [
      ...regular.slice(this.config.settings.backupKeep),
      ...pre.slice(MANUAL_PRE_RESTORE_KEEP)
    ].map((b) => ({ path: b.path, size: b.size }))
    if (!existsSync(this.paths.backupsDir)) return plan
    for (const f of readdirSync(this.paths.backupsDir)) {
      if (!f.endsWith(`.${BACKUP_EXT}.part`)) continue
      const part = join(this.paths.backupsDir, f)
      const st = statSync(part, { throwIfNoEntry: false })
      if (st && now() - st.mtimeMs > STALE_PART_MS) plan.push({ path: part, size: st.size })
    }
    return plan
  }

  /** Removes `prunePlan()`; no backup or restore can start meanwhile (they share the `running` flag). */
  async pruneOld(): Promise<StorageFreed> {
    if (this.isBusy()) throw new UserError('Зачекайте, поки завершиться бекап, і спробуйте ще раз')
    this.running = true
    try {
      const freed = await removeFiles(this.prunePlan(), 'backup')
      log.info('[backup] removed old backups', freed)
      return freed
    } finally {
      this.running = false
    }
  }

  async restore(path?: string): Promise<boolean> {
    if (this.restoring) throw new UserError('Відновлення вже виконується')
    this.restoring = true
    try {
      return await this.restoreFrom(path)
    } finally {
      this.restoring = false
    }
  }

  private async restoreFrom(path?: string): Promise<boolean> {
    let file = path
    if (!file) {
      const res = await dialog.showOpenDialog(this.parent(), {
        title: 'Відновити з бекапу',
        defaultPath: this.paths.backupsDir,
        properties: ['openFile'],
        filters: [{ name: 'Vault backup', extensions: [BACKUP_EXT, 'zip'] }]
      })
      if (res.canceled || !res.filePaths[0]) return false
      file = res.filePaths[0]
    }
    const confirm = await dialog.showMessageBox(this.parent(), {
      type: 'warning',
      buttons: ['Відновити', 'Скасувати'],
      defaultId: 1,
      cancelId: 1,
      title: 'Відновлення',
      message: 'Поточні дані буде замінено даними з бекапу.',
      detail: 'Перед цим автоматично збережеться бекап поточного стану.'
    })
    if (confirm.response !== 0) return false

    let archive: Unzipped
    let manifest: Manifest
    try {
      archive = await unzipAsync(readFileSync(file))
      const manifestRaw = archive[MANIFEST]
      if (!manifestRaw || !archive['vault.db'])
        throw new Error('no manifest or vault.db in the archive')
      manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as Manifest
    } catch (e) {
      log.warn('[backup] unreadable backup', file, e)
      throw new UserError('Файл пошкоджений або це не бекап Vault')
    }
    if (manifest.format !== 'vault-backup') throw new UserError('Невідомий формат бекапу')
    // A backup from a newer Vault may carry migrations this version doesn't know.
    if (manifest.appVersion && compareVersions(manifest.appVersion, app.getVersion()) > 0)
      throw new UserError(
        `Бекап зроблено новішою версією Vault (${manifest.appVersion}). Спершу оновіть застосунок.`
      )

    // Check the database inside the archive before touching current data.
    const stamp = Date.now()
    const candidate = join(this.paths.tmpDir, `restore-${stamp}.db`)
    mkdirSync(this.paths.tmpDir, { recursive: true })
    writeFileSync(candidate, archive['vault.db'])
    try {
      const probe = new Database(candidate, { readonly: true, fileMustExist: true })
      const ok = probe.pragma('quick_check', { simple: true })
      probe.close()
      if (ok !== 'ok') throw new Error(String(ok))
    } catch (e) {
      rmSync(candidate, { force: true })
      log.warn('[backup] the database in the backup failed the check', file, e)
      throw new UserError('База в бекапі пошкоджена — відновити з нього не вийде')
    }

    // Archive entries are untrusted: only plain relative paths that stay inside files/ (zip-slip incl. «..\»).
    const files: [string, Uint8Array][] = []
    for (const [name, bytes] of Object.entries(archive)) {
      if (!name.startsWith('files/') || name.endsWith('/')) continue
      const parts = name.slice('files/'.length).split(/[\\/]/)
      if (parts.some((p) => p === '' || p === '.' || p === '..' || p.includes(':'))) {
        log.warn(`[backup] skipped unsafe entry: ${name}`)
        continue
      }
      const abs = resolve(this.paths.filesDir, ...parts)
      const back = relative(this.paths.filesDir, abs)
      if (!back || back.startsWith('..') || isAbsolute(back)) {
        log.warn(`[backup] skipped entry outside files: ${name}`)
        continue
      }
      files.push([abs, bytes])
    }

    try {
      await this.create({ saveAs: false, label: 'pre-restore' })
    } catch (e) {
      rmSync(candidate, { force: true })
      throw e
    }

    // Swap with rollback: if anything fails, the current DB and files come back exactly as they were.
    // The flags record what has actually moved: a rename that failed (EBUSY from an antivirus) left the
    // live database or folder in place, and the rollback must not delete it.
    const { dbFile, filesDir } = this.paths
    const oldDb = join(this.paths.tmpDir, `db-before-restore-${stamp}.db`)
    const oldFiles = join(this.paths.tmpDir, `files-before-restore-${stamp}`)
    const hadFiles = existsSync(filesDir)
    let movedDb = false
    let placedDb = false
    let movedFiles = false
    let createdFiles = false
    this.ctx.close()
    try {
      for (const suffix of ['-wal', '-shm']) rmSync(dbFile + suffix, { force: true })
      if (existsSync(dbFile)) {
        renameSync(dbFile, oldDb)
        movedDb = true
      }
      renameSync(candidate, dbFile)
      placedDb = true
      if (hadFiles) {
        renameSync(filesDir, oldFiles)
        movedFiles = true
      }
      mkdirSync(filesDir, { recursive: true })
      createdFiles = true
      for (const [abs, bytes] of files) {
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, bytes)
      }
      this.ctx.open() // runs migrations on the restored DB
    } catch (e) {
      log.error('[backup] restore failed, rolling back', e)
      rmSync(candidate, { force: true })
      try {
        this.ctx.close()
      } catch {
        /* not open */
      }
      // vault.db never disappears: the old file is renamed over the restored one (rename replaces on Windows).
      // What can't be put back stays where it is and the user is told where.
      const kept: string[] = []
      try {
        // WAL of the restored database must not be replayed onto the old one.
        for (const suffix of ['-wal', '-shm']) rmSync(dbFile + suffix, { force: true })
        if (movedDb) retryBusy(() => renameSync(oldDb, dbFile))
        else if (placedDb) rmSync(dbFile, { force: true })
      } catch (re) {
        log.error('[backup] could not put the current database back', oldDb, re)
        kept.push(`базу — у ${oldDb}`)
      }
      try {
        if (movedFiles || (createdFiles && !hadFiles))
          rmSync(filesDir, { recursive: true, force: true })
        if (movedFiles) retryBusy(() => renameSync(oldFiles, filesDir))
      } catch (re) {
        log.error('[backup] could not put the current files back', oldFiles, re)
        kept.push(`папку з файлами — у ${oldFiles}`)
      }
      try {
        this.ctx.open()
      } catch (oe) {
        log.error('[backup] could not reopen the database after the rollback', oe)
      }
      if (kept.length) {
        throw new UserError(
          `Не вдалося повернути поточні дані: ${kept.join('; ')}. Перезапустіть Vault, подробиці — у журналі: ${LOG_HINT}.`
        )
      }
      throw new UserError(restoreFailMessage(e))
    }
    this.search.rebuild()
    this.bus.dataChanged('all')
    for (const w of BrowserWindow.getAllWindows()) w.webContents.reload()
    // The old data goes only once the restored one is in use.
    rmSync(oldDb, { force: true })
    rmSync(oldFiles, { recursive: true, force: true })
    return true
  }

  /** Daily automatic backup; checks hourly so a sleeping laptop still gets one. */
  startAuto(): void {
    const check = (): void => {
      const s = this.config.settings
      if (!s.autoBackup) return
      const last = this.config.lastBackupAt ?? 0
      // The day's backup is made: a copy the folder missed (disk unplugged, cloud not running) is retried hourly.
      if (now() - last < DAY_MS) return void this.syncFolder('auto')
      // A manual backup or a restore is running: not a failure, the next hourly check tries again.
      if (this.running || this.restoring) return
      this.create({ saveAs: false }, 'auto')
        .then(() => {
          this.failNotifiedDay = null
        })
        .catch((e) => this.autoFailed(e))
    }
    setTimeout(check, 20_000)
    this.timer = setInterval(check, 60 * 60_000)
  }

  /** Without a word the user finds out only when they need a backup that was never made. */
  private autoFailed(e: unknown): void {
    log.error('[backup] auto backup failed', e)
    const today = dayKey(now())
    if (this.failNotifiedDay === today) return
    this.failNotifiedDay = today
    showNotification({ title: 'Автобекап не вдався', body: `Подробиці — у журналі: ${LOG_HINT}` })
    this.bus.emit('toast', {
      kind: 'error',
      message: `Автобекап не вдався — подробиці в журналі: ${LOG_HINT}`
    })
  }

  /* ───────────── «Папка для копій» ───────────── */

  folderInfo(): BackupFolderInfo {
    const s = this.config.backupFolder
    return {
      path: s.path,
      lastOkAt: s.lastOkAt,
      lastError: s.lastError,
      enabled: this.opts.folderCopies
    }
  }

  /** Folders a copy must never go into (rotation there would be next to the live data). */
  private vaultDirs(): string[] {
    return [this.paths.dataDir, dirname(this.paths.configFile)]
  }

  private machine(): MachineTag {
    let id = this.config.backupFolder.machineId
    if (!id) {
      id = randomBytes(4).toString('hex')
      this.config.updateBackupFolder({ machineId: id })
    }
    return machineTag(this.opts.hostname ?? hostname(), id)
  }

  /** «Вибрати папку»: main's own dialog, then the same checks a copy runs; the newest backup goes there at once. */
  async chooseFolder(): Promise<BackupFolderInfo | null> {
    if (!this.opts.folderCopies) throw new UserError('У тестовому режимі копії в окрему папку вимкнено.')
    const res = await dialog.showOpenDialog(this.parent(), {
      title: 'Папка для копій бекапу',
      defaultPath: this.config.backupFolder.path ?? app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    })
    const dir = res.canceled ? undefined : res.filePaths[0]
    if (!dir) return null
    return this.useFolder(dir)
  }

  /** Separate from the dialog for the tests; never reachable by RPC with a path. */
  async useFolder(dir: string): Promise<BackupFolderInfo> {
    const abs = resolve(dir)
    await assertUsableFolder(abs, this.vaultDirs())
    try {
      await assertWritable(abs, this.machine())
    } catch (e) {
      log.warn('[backup] the chosen folder is not writable', abs, e)
      throw new UserError(folderErrorMessage(e, abs))
    }
    this.config.updateBackupFolder({ path: abs, lastOkAt: null, lastStamp: null, lastError: null })
    log.info('[backup] copies folder set', abs)
    void this.syncFolder('manual')
    return this.folderInfo()
  }

  /** Back to the default. Copies already in the folder stay where they are. */
  resetFolder(): BackupFolderInfo {
    this.config.updateBackupFolder({ path: null, lastOkAt: null, lastStamp: null, lastError: null })
    log.info('[backup] copies folder cleared')
    return this.folderInfo()
  }

  async openFolder(): Promise<void> {
    const dir = this.config.backupFolder.path
    if (!dir) throw new UserError('Папку для копій не вибрано')
    await openPathOrThrow(dir, 'Не вдалося відкрити папку для копій — можливо, диск відключено')
  }

  /**
   * Puts the newest regular backup into «Папка для копій», if it isn't there yet; never rejects. One job at a
   * time: a call while one runs gets that job.
   */
  syncFolder(trigger: 'manual' | 'auto'): Promise<void> {
    if (!this.opts.folderCopies || !this.config.backupFolder.path) return Promise.resolve()
    this.folderJob ??= this.copyToFolder(trigger).finally(() => {
      this.folderJob = null
    })
    return this.folderJob
  }

  private async copyToFolder(trigger: 'manual' | 'auto'): Promise<void> {
    const dir = this.config.backupFolder.path
    if (!dir) return
    const newest = this.list().find((b) => REGULAR.test(b.fileName))
    const stamp = newest && REGULAR.exec(newest.fileName)![1]
    if (!newest || !stamp || this.config.backupFolder.lastStamp === stamp) return
    const tag = this.machine()
    const name = copyName(tag, stamp)
    // The folder may be changed or cleared while a copy runs: the result belongs to the folder it went to.
    const stillThere = (): boolean => this.config.backupFolder.path === dir
    try {
      await assertUsableFolder(dir, this.vaultDirs())
      if (!(await exists(join(dir, name)))) {
        const expected = await this.factsFor(newest.fileName, newest.path)
        await writeCopy(dir, name, await readFile(newest.path))
        try {
          // Read back from the folder itself: what a cloud client or a flaky disk actually kept.
          await verifyBackup(await readFile(join(dir, name)), expected, this.paths.tmpDir)
        } catch (e) {
          await removeOwnCopy(dir, tag, name).catch((re) => log.warn('[backup] could not remove a bad copy', re))
          throw e
        }
        // Only after a good copy: a failed one never pushes an older good copy out.
        const removed = await rotateCopies(dir, tag, this.config.settings.backupFolderKeep)
        if (removed.length) log.info('[backup] copies folder rotation removed', removed)
      }
      if (!stillThere()) return
      this.config.updateBackupFolder({ lastOkAt: now(), lastStamp: stamp, lastError: null })
      this.folderFailNotifiedDay = null
      log.info('[backup] copy saved to the folder', name)
      if (trigger === 'manual')
        this.bus.emit('toast', { kind: 'success', message: `Копію перевірено й збережено в папку ${basename(dir) || dir}` })
    } catch (e) {
      if (stillThere()) this.folderFailed(e, dir, trigger)
    } finally {
      // The settings page shows the result (the renderer refetches on this event).
      this.bus.emit('settings:changed', this.config.settings)
    }
  }

  /** The facts the folder copy must match: kept from the backup just made, or read from the local file. */
  private async factsFor(fileName: string, path: string): Promise<BackupFacts> {
    if (this.factsOf?.fileName === fileName) return this.factsOf.facts
    return readBackupFacts(await readFile(path), this.paths.tmpDir)
  }

  private folderFailed(e: unknown, dir: string, trigger: 'manual' | 'auto'): void {
    const message =
      e instanceof BackupCheckError
        ? 'Копія не пройшла перевірку й видалена, попередні копії не змінено. Подробиці — у журналі.'
        : folderErrorMessage(e, dir)
    log.warn('[backup] copy to the folder failed', dir, e)
    this.config.updateBackupFolder({ lastError: { at: now(), message: message.slice(0, 1000) } })
    if (trigger === 'auto') {
      const today = dayKey(now())
      if (this.folderFailNotifiedDay === today) return
      this.folderFailNotifiedDay = today
      showNotification({ title: 'Копію бекапу в папку не збережено', body: message })
    }
    const retry = this.config.settings.autoBackup ? ' — Vault спробує ще раз за годину' : ''
    this.bus.emit('toast', {
      kind: 'error',
      message: `Копію в папку не збережено. ${message} Бекап на цьому комп’ютері є${retry}.`
    })
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private parent(): BrowserWindow {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  }

  api(exporter: ExportService): BackupApi {
    return {
      list: async () => this.list(),
      create: async (args) => this.create(z.object({ saveAs: z.boolean() }).parse(args)),
      restore: async (args) =>
        this.restore(z.object({ path: z.string().optional() }).parse(args ?? {}).path),
      folder: async () => this.folderInfo(),
      chooseFolder: () => this.chooseFolder(),
      resetFolder: async () => this.resetFolder(),
      openFolder: () => this.openFolder(),
      export: async (format) => exporter.export(z.enum(EXPORT_FORMATS).parse(format))
    }
  }
}

/** Why the swap failed, in words the user can act on; the technical cause goes to the log. */
function restoreFailMessage(e: unknown): string {
  const code = (e as NodeJS.ErrnoException | undefined)?.code
  if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')
    return 'Папку з файлами або базу зараз використовує інша програма (Провідник, переглядач) — закрийте її й спробуйте ще раз. Поточні дані залишилися як були.'
  return 'Не вдалося відновити бекап — подробиці в журналі. Поточні дані залишилися як були.'
}

/** -1 / 0 / 1 for versions like «0.1.0-beta.6»: prerelease < release, beta.10 > beta.9. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string): [number[], string] => {
    const [core, pre = ''] = v.split('-')
    return [core.split('.').map((n) => Number(n) || 0), pre]
  }
  const [ac, ap] = parse(a)
  const [bc, bp] = parse(b)
  for (let i = 0; i < 3; i++)
    if ((ac[i] ?? 0) !== (bc[i] ?? 0)) return (ac[i] ?? 0) > (bc[i] ?? 0) ? 1 : -1
  if (ap === bp) return 0
  if (!ap) return 1
  if (!bp) return -1
  const an = Number(ap.split('.').pop())
  const bn = Number(bp.split('.').pop())
  if (Number.isNaN(an) || Number.isNaN(bn)) return ap > bp ? 1 : -1
  return an === bn ? 0 : an > bn ? 1 : -1
}
