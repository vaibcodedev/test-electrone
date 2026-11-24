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
import type { AsyncZippable } from 'fflate'
import { unzipAsync, zipAsync } from '../core/zip'
import type { BackupEntry } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import type { AppPaths } from '../core/paths'
import type { ConfigStore } from '../core/config-store'
import type { EventBus } from '../core/event-bus'
import type { SearchIndex } from './search-index'
import { DAY_MS, now, UserError } from '../core/util'


const BACKUP_EXT = 'vaultbak'
const MANIFEST = 'manifest.json'
const STORE_ONLY = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|zip)$/i

interface Manifest {
  format: 'vault-backup'
  version: 1
  appVersion: string
  createdAt: number
}

/** Recursively collects files under root as { 'prefix/rel/path': [bytes, opts] }. */
export function collectFiles(root: string, prefix: string, out: AsyncZippable = {}, dir = root): AsyncZippable {
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
      const manifest: Manifest = { format: 'vault-backup', version: 1, appVersion: app.getVersion(), createdAt: now() }
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
      writeFileSync(target, bytes)
      this.config.lastBackupAt = now()
      if (!opts.saveAs) this.prune()
      const st = statSync(target)
      return { fileName: target.split(/[\\/]/).pop()!, path: target, size: st.size, createdAt: st.mtimeMs }
    } finally {
      this.running = false
    }
  }

  private prune(): void {
    const keep = this.config.settings.backupKeep
    const auto = this.list().filter((b) => !b.fileName.includes('-pre-restore-'))
    for (const b of auto.slice(keep)) rmSync(b.path, { force: true })
  }

  async restore(path?: string): Promise<boolean> {
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

    const archive = await unzipAsync(readFileSync(file))
    const manifestRaw = archive[MANIFEST]
    if (!manifestRaw || !archive['vault.db']) throw new UserError('Це не файл бекапу Vault')
    const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as Manifest
    if (manifest.format !== 'vault-backup') throw new UserError('Невідомий формат бекапу')
    // A backup from a newer Vault may carry migrations this version doesn't know.
    if (manifest.appVersion && compareVersions(manifest.appVersion, app.getVersion()) > 0)
      throw new UserError(`Бекап зроблено новішою версією Vault (${manifest.appVersion}). Спершу оновіть застосунок.`)

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
      throw new UserError(`База в бекапі пошкоджена: ${(e as Error).message}`)
    }

    // Archive entries are untrusted: only plain relative paths that stay inside files/ (zip-slip incl. «..\»).
    const files: [string, Uint8Array][] = []
    for (const [name, bytes] of Object.entries(archive)) {
      if (!name.startsWith('files/') || name.endsWith('/')) continue
      const parts = name.slice('files/'.length).split(/[\/]/)
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

    await this.create({ saveAs: false, label: 'pre-restore' })

    // Swap with rollback: if anything fails, the current DB and files come back exactly as they were.
    const oldDb = join(this.paths.tmpDir, `db-before-restore-${stamp}.db`)
    const oldFiles = join(this.paths.tmpDir, `files-before-restore-${stamp}`)
    this.ctx.close()
    try {
      for (const suffix of ['-wal', '-shm']) rmSync(this.paths.dbFile + suffix, { force: true })
      if (existsSync(this.paths.dbFile)) renameSync(this.paths.dbFile, oldDb)
      renameSync(candidate, this.paths.dbFile)
      if (existsSync(this.paths.filesDir)) renameSync(this.paths.filesDir, oldFiles)
      mkdirSync(this.paths.filesDir, { recursive: true })
      for (const [abs, bytes] of files) {
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, bytes)
      }
      this.ctx.open() // runs migrations on the restored DB
    } catch (e) {
      log.error('[backup] restore failed, rolling back', e)
      try {
        this.ctx.close()
      } catch {
        /* not open */
      }
      rmSync(this.paths.dbFile, { force: true })
      if (existsSync(oldDb)) renameSync(oldDb, this.paths.dbFile)
      if (existsSync(oldFiles)) {
        rmSync(this.paths.filesDir, { recursive: true, force: true })
        renameSync(oldFiles, this.paths.filesDir)
      }
      this.ctx.open()
      throw new UserError(`Не вдалося відновити бекап: ${(e as Error).message}. Поточні дані залишилися як були.`)
    }
    rmSync(oldDb, { force: true })
    rmSync(oldFiles, { recursive: true, force: true })
    this.search.rebuild()
    this.bus.dataChanged('all')
    for (const w of BrowserWindow.getAllWindows()) w.webContents.reload()
    return true
  }

  /** Daily automatic backup; checks hourly so a sleeping laptop still gets one. */
  startAuto(): void {
    const check = (): void => {
      const s = this.config.settings
      const last = this.config.lastBackupAt ?? 0
      if (!s.autoBackup || now() - last < DAY_MS) return
      this.create({ saveAs: false }).catch((e) => log.error('[backup] auto backup failed', e))
    }
    setTimeout(check, 20_000)
    this.timer = setInterval(check, 60 * 60_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private parent(): BrowserWindow {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  }
}

/** -1 / 0 / 1 for versions like «0.1.0-beta.6»: prerelease < release, beta.10 > beta.9. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string): [number[], string] => {
    const [core, pre = ''] = v.split('-')
    return [core.split('.').map((n) => Number(n) || 0), pre]
  }
  const [ac, ap] = parse(a)
  const [bc, bp] = parse(b)
  for (let i = 0; i < 3; i++) if ((ac[i] ?? 0) !== (bc[i] ?? 0)) return (ac[i] ?? 0) > (bc[i] ?? 0) ? 1 : -1
  if (ap === bp) return 0
  if (!ap) return 1
  if (!bp) return -1
  const an = Number(ap.split('.').pop())
  const bn = Number(bp.split('.').pop())
  if (Number.isNaN(an) || Number.isNaN(bn)) return ap > bp ? 1 : -1
  return an === bn ? 0 : an > bn ? 1 : -1
}
