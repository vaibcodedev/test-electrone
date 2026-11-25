import { app, BrowserWindow, dialog } from 'electron'
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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import Database from 'better-sqlite3'
import { log } from '../core/logger'
import type { AsyncZippable, Unzipped } from 'fflate'
import { unzipAsync, zipAsync } from '../core/zip'
import { z } from 'zod'
import type { BackupApi } from '@shared/api'
import { EXPORT_FORMATS, type BackupEntry, type StorageFreed } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import type { AppPaths } from '../core/paths'
import type { ConfigStore } from '../core/config-store'
import type { EventBus } from '../core/event-bus'
import type { SearchIndex } from './search-index'
import type { ExportService } from './export-service'
import { showNotification } from '../core/notify'
import { removeFiles } from '../core/remove-files'
import { DAY_MS, dayKey, now, retryBusy, UserError } from '../core/util'

const BACKUP_EXT = 'vaultbak'
const MANIFEST = 'manifest.json'
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

  constructor(
    private readonly ctx: DbContext,
    private readonly paths: AppPaths,
    private readonly config: ConfigStore,
    private readonly search: SearchIndex,
    private readonly bus: EventBus
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

  /** Builds the backup archive bytes. */
  async build(): Promise<Uint8Array> {
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
        'vault.db': readFileSync(tmpDb)
      }
      collectFiles(this.paths.filesDir, 'files', entries)
      return await zipAsync(entries, { level: 6 })
    } finally {
      rmSync(tmpDb, { force: true })
    }
  }

  async create(opts: { saveAs: boolean; label?: string }): Promise<BackupEntry | null> {
    if (this.running) throw new UserError('Бекап уже виконується')
    this.running = true
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
      const bytes = await this.build()
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
      this.config.lastBackupAt = now()
      if (!opts.saveAs) this.prune()
      const st = statSync(target)
      return {
        fileName: target.split(/[\\/]/).pop()!,
        path: target,
        size: st.size,
        createdAt: st.mtimeMs
      }
    } finally {
      this.running = false
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
      const last = this.config.lastBackupAt ?? 0
      if (!s.autoBackup || now() - last < DAY_MS) return
      // A manual backup or a restore is running: not a failure, the next hourly check tries again.
      if (this.running || this.restoring) return
      this.create({ saveAs: false })
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
