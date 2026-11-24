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
import { dirname, join, relative, sep } from 'path'
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
    if (this.running) throw new UserError('Бэкап уже выполняется')
    this.running = true
    try {
      const fileName = `vault-${opts.label ? opts.label + '-' : ''}${this.stamp()}.${BACKUP_EXT}`
      let target = join(this.paths.backupsDir, fileName)
      if (opts.saveAs) {
        const res = await dialog.showSaveDialog(this.parent(), {
          title: 'Сохранить бэкап',
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
        title: 'Восстановить из бэкапа',
        defaultPath: this.paths.backupsDir,
        properties: ['openFile'],
        filters: [{ name: 'Vault backup', extensions: [BACKUP_EXT, 'zip'] }]
      })
      if (res.canceled || !res.filePaths[0]) return false
      file = res.filePaths[0]
    }
    const confirm = await dialog.showMessageBox(this.parent(), {
      type: 'warning',
      buttons: ['Восстановить', 'Отмена'],
      defaultId: 1,
      cancelId: 1,
      title: 'Восстановление',
      message: 'Текущие данные будут заменены данными из бэкапа.',
      detail: 'Перед этим будет автоматически сохранён бэкап текущего состояния.'
    })
    if (confirm.response !== 0) return false

    const archive = await unzipAsync(readFileSync(file))
    const manifestRaw = archive[MANIFEST]
    if (!manifestRaw || !archive['vault.db']) throw new UserError('Это не файл бэкапа Vault')
    const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as Manifest
    if (manifest.format !== 'vault-backup') throw new UserError('Неизвестный формат бэкапа')

    await this.create({ saveAs: false, label: 'pre-restore' })

    const oldFiles = join(this.paths.tmpDir, `files-before-restore-${Date.now()}`)
    this.ctx.close()
    try {
      for (const suffix of ['', '-wal', '-shm']) rmSync(this.paths.dbFile + suffix, { force: true })
      writeFileSync(this.paths.dbFile, archive['vault.db'])
      if (existsSync(this.paths.filesDir)) renameSync(this.paths.filesDir, oldFiles)
      mkdirSync(this.paths.filesDir, { recursive: true })
      for (const [name, bytes] of Object.entries(archive)) {
        if (!name.startsWith('files/') || name.endsWith('/')) continue
        const rel = name.slice('files/'.length)
        if (rel.split('/').includes('..')) continue
        const abs = join(this.paths.filesDir, rel)
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, bytes)
      }
    } finally {
      this.ctx.open()
    }
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
      this.create({ saveAs: false }).catch((e) => console.error('[backup]', e))
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
