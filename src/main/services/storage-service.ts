import { statSync } from 'fs'
import { rm, statfs } from 'fs/promises'
import type { StorageApi } from '@shared/api'
import { storageFolderSchema, type StorageFreed, type StorageUsage } from '@shared/domain/system'
import { log } from '../core/logger'
import { openPathOrThrow } from '../core/open-path'
import { UserError } from '../core/util'
import { removeFiles } from '../core/remove-files'
import {
  THUMBS_DIR_NAME,
  dirSize,
  listFiles,
  logsDirIsOwn,
  planOldLogs,
  walkSizes,
  type StorageLayout
} from './storage-usage'

/**
 * The part of Electron's Session the cleanup needs. `storages` is a closed list on purpose: without it
 * clearStorageData clears everything, localStorage, IndexedDB and cookies included (Electron docs).
 */
export interface CacheSession {
  clearCache(): Promise<void>
  clearCodeCaches(options: { urls?: string[] }): Promise<void>
  clearStorageData(options: { storages: ('shadercache' | 'cachestorage')[] }): Promise<void>
  getCacheSize(): Promise<number>
}

/** What StorageService needs from BackupService (the plan has to match what pruneOld removes). */
export interface BackupPruner {
  prunePlan(): { path: string; size: number }[]
  pruneOld(): Promise<StorageFreed>
  isBusy(): boolean
}

export interface StorageDeps {
  layout: StorageLayout
  /** Current log file (logFilePath): never removed. */
  currentLog: () => string
  /** Folder of the installed program; null when not packaged. */
  installDir: string | null
  /** Called only when needed: session.defaultSession exists after app ready. */
  session: () => CacheSession
  backups: BackupPruner
  /** Injectable for tests (counts walks). */
  walk?: typeof walkSizes
}

/** Cached sizes stay valid this long, unless the fingerprint changes first. */
const CACHE_TTL_MS = 10_000

/**
 * «Сховище»: how much Vault takes on disk and the cleanups that never touch user data.
 * The walk is cached (10 s + a cheap fingerprint of the folders): the settings page refetches every query
 * after any toggle, and walking thousands of files each time would load the main process for nothing.
 */
export class StorageService {
  private cached: { value: StorageUsage; at: number; fingerprint: string } | null = null
  private inflight: Promise<StorageUsage> | null = null
  /** Bumped by every reset: a walk started before it doesn't land in the cache. */
  private generation = 0
  private cacheBusy = false
  private logsBusy = false
  private readonly walk: typeof walkSizes

  constructor(private readonly deps: StorageDeps) {
    this.walk = deps.walk ?? walkSizes
  }

  async usage(): Promise<StorageUsage> {
    const fingerprint = this.fingerprint()
    const c = this.cached
    if (c && Date.now() - c.at < CACHE_TTL_MS && c.fingerprint === fingerprint) return c.value
    if (this.inflight) return this.inflight
    const gen = this.generation
    const job = this.compute()
      .then((value) => {
        if (gen === this.generation) this.cached = { value, at: Date.now(), fingerprint }
        return value
      })
      .finally(() => {
        if (this.inflight === job) this.inflight = null
      })
    this.inflight = job
    return job
  }

  /** «Перерахувати»: the next usage() walks the disk again. */
  recount(): void {
    this.generation++
    this.cached = null
    this.inflight = null
  }

  async clearCache(): Promise<StorageFreed> {
    if (this.cacheBusy) throw new UserError('Очищення вже виконується')
    this.cacheBusy = true
    try {
      const before = (await this.walk(this.deps.layout)).cache
      const s = this.deps.session()
      // Logical size of the HTTP cache — for the log only; the row shows bytes on disk.
      log.info(
        '[storage] http cache before clear',
        await s.getCacheSize().catch(() => -1),
        'on disk',
        before.bytes
      )
      // No rm of the folders: on Windows the GPU and network processes hold them open.
      await s.clearCache()
      await s.clearCodeCaches({})
      await s.clearStorageData({ storages: ['shadercache', 'cachestorage'] })
      // Vault's own tile thumbnails: nothing holds them open, so the folder simply goes (they come back on use).
      const thumbs = this.deps.layout.cacheDirs.find((d) => d.endsWith(THUMBS_DIR_NAME))
      if (thumbs)
        await rm(thumbs, { recursive: true, force: true }).catch((e: unknown) =>
          log.warn('[storage] thumbnails not removed', e instanceof Error ? e.message : e)
        )
      const after = (await this.walk(this.deps.layout)).cache
      const freed: StorageFreed = {
        freedBytes: Math.max(0, before.bytes - after.bytes),
        removed: Math.max(0, before.count - after.count)
      }
      log.info('[storage] cache cleared', freed)
      return freed
    } finally {
      this.cacheBusy = false
      this.recount()
    }
  }

  async clearLogs(): Promise<StorageFreed> {
    if (this.logsBusy) throw new UserError('Очищення вже виконується')
    this.logsBusy = true
    try {
      const { layout } = this.deps
      if (!logsDirIsOwn(layout)) {
        log.warn(
          '[storage] log folder is outside userData, old logs are not removed',
          layout.logsDir
        )
        return { freedBytes: 0, removed: 0 }
      }
      const plan = planOldLogs(await listFiles(layout.logsDir), this.deps.currentLog(), layout)
      const freed = await removeFiles(plan, 'log')
      log.info('[storage] removed old logs', freed)
      return freed
    } finally {
      this.logsBusy = false
      this.recount()
    }
  }

  async pruneBackups(): Promise<StorageFreed> {
    try {
      return await this.deps.backups.pruneOld()
    } finally {
      this.recount()
    }
  }

  /** Cheap «did something change» check: folder mtimes, the database size, the backup prune plan. */
  private fingerprint(): string {
    const { layout } = this.deps
    const mark = (p: string, key: 'mtimeMs' | 'size'): string => {
      try {
        return String(statSync(p)[key])
      } catch {
        return '-'
      }
    }
    return [
      mark(layout.backupsDir, 'mtimeMs'),
      mark(layout.filesDir, 'mtimeMs'),
      mark(layout.logsDir, 'mtimeMs'),
      mark(layout.dbFile, 'size'),
      mark(layout.dbFile + '-wal', 'size'),
      // «Скільки копій зберігати» changes what may go without touching the folder.
      String(this.deps.backups.prunePlan().length)
    ].join('|')
  }

  private async compute(): Promise<StorageUsage> {
    const { layout, installDir, backups } = this.deps
    const sizes = await this.walk(layout)
    const oldLogs = planOldLogs(await listFiles(layout.logsDir), this.deps.currentLog(), layout)
    const removableLogs = sum(oldLogs)
    const backupCount = (await listFiles(layout.backupsDir)).filter(
      (f) => !f.path.endsWith('.part')
    ).length
    const plan = backups.prunePlan()
    const app = installDir ? { bytes: await dirSize(installDir), installDir } : null
    // The current log (and anything else in the log folder that stays) is counted in «Інше».
    const other = sizes.other.bytes + Math.max(0, sizes.logs.bytes - removableLogs)
    const total =
      sizes.database.bytes +
      sizes.files.bytes +
      sizes.backups.bytes +
      removableLogs +
      sizes.cache.bytes +
      other +
      (app?.bytes ?? 0)
    return {
      computedAt: Date.now(),
      database: { bytes: sizes.database.bytes },
      files: { bytes: sizes.files.bytes, count: sizes.files.count },
      backups: {
        bytes: sizes.backups.bytes,
        count: backupCount,
        prunable: { count: plan.length, bytes: sum(plan) }
      },
      logs: { bytes: sizes.logs.bytes, removableBytes: removableLogs },
      cache: { bytes: sizes.cache.bytes },
      other: { bytes: other },
      app,
      total,
      diskFree: await this.diskFree()
    }
  }

  private async diskFree(): Promise<number | null> {
    try {
      const s = await statfs(this.deps.layout.dataDir)
      return s.bsize * s.bavail
    } catch (e) {
      log.warn('[storage] statfs failed', e)
      return null
    }
  }

  private folderPath(folder: 'data' | 'files' | 'backups' | 'app'): string {
    const { layout, installDir } = this.deps
    switch (folder) {
      case 'data':
        return layout.dataDir
      case 'files':
        return layout.filesDir
      case 'backups':
        return layout.backupsDir
      case 'app':
        if (!installDir) throw new UserError('Папка програми є лише у встановленій версії')
        return installDir
    }
  }

  api(): StorageApi {
    return {
      usage: () => this.usage(),
      recount: async () => this.recount(),
      clearCache: () => this.clearCache(),
      clearLogs: () => this.clearLogs(),
      pruneBackups: () => this.pruneBackups(),
      openFolder: async (args) => {
        const { folder } = storageFolderSchema.parse(args)
        await openPathOrThrow(
          this.folderPath(folder),
          'Не вдалося відкрити папку — можливо, її видалено'
        )
      }
    }
  }
}

const sum = (files: { size: number }[]): number => files.reduce((s, f) => s + f.size, 0)
