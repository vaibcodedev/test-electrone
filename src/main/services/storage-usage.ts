/**
 * Disk use of Vault by category (Налаштування → Сховище). Pure fs code, no Electron: the service passes
 * the folders in, tests use a temp dir and `platform: 'win32'` for case-insensitive Windows paths.
 */
import { readdir, stat } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'

export type StorageCategory = 'database' | 'files' | 'backups' | 'logs' | 'cache' | 'other'
export type Sizes = Record<StorageCategory, { bytes: number; count: number }>

export interface StorageLayout {
  platform: NodeJS.Platform
  userData: string
  dataDir: string
  /** Folders walked: userData, sessionData, dataDir, logsDir — one nested in another is dropped. */
  roots: string[]
  dbFile: string
  filesDir: string
  backupsDir: string
  logsDir: string
  /** sessionData + CACHE_DIR_NAMES: only what «Очистити кеш» really empties. */
  cacheDirs: string[]
}

/**
 * Chromium folders the session clears: HTTP cache, V8 code cache, GPU shader cache, Cache Storage.
 * Dawn*, Shared Dictionary and the rest of «Service Worker» stay in «Інше»: the button doesn't empty them,
 * and the row would keep showing megabytes after a cleanup.
 */
export const CACHE_DIR_NAMES = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'Service Worker/CacheStorage'
] as const

const SKIPPED = new Set(['ENOENT', 'EPERM', 'EBUSY', 'EACCES', 'ENOTDIR'])
const STAT_BATCH = 64

const pathOf = (platform: NodeJS.Platform): path.PlatformPath =>
  platform === 'win32' ? path.win32 : path.posix

/** Absolute, and lower-case on Windows (`c:\…` and `C:\…` are the same folder). */
export function normPath(p: string, platform: NodeJS.Platform = process.platform): string {
  const abs = pathOf(platform).resolve(p)
  return platform === 'win32' ? abs.toLowerCase() : abs
}

/** True for the folder itself or anything under it; `files` is not inside `files-before-restore-1`. */
export function isInside(
  child: string,
  parent: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const c = normPath(child, platform)
  const p = normPath(parent, platform)
  if (c === p) return true
  const sep = pathOf(platform).sep
  return c.startsWith(p.endsWith(sep) ? p : p + sep)
}

export function storageLayout(
  paths: { dataDir: string; dbFile: string; filesDir: string; backupsDir: string },
  dirs: { userData: string; sessionData: string; logsDir: string },
  platform: NodeJS.Platform = process.platform
): StorageLayout {
  const p = pathOf(platform)
  const candidates = [dirs.userData, dirs.sessionData, paths.dataDir, dirs.logsDir]
  const roots: string[] = []
  for (const dir of candidates) {
    if (roots.some((r) => isInside(dir, r, platform))) continue
    // A later folder may contain one taken earlier: keep only the outer one.
    for (let i = roots.length - 1; i >= 0; i--)
      if (isInside(roots[i], dir, platform)) roots.splice(i, 1)
    roots.push(dir)
  }
  return {
    platform,
    userData: dirs.userData,
    dataDir: paths.dataDir,
    roots,
    dbFile: paths.dbFile,
    filesDir: paths.filesDir,
    backupsDir: paths.backupsDir,
    logsDir: dirs.logsDir,
    cacheDirs: CACHE_DIR_NAMES.map((name) => p.join(dirs.sessionData, ...name.split('/')))
  }
}

/** Which row a file belongs to. Anything unknown (.tmp, Local Storage, IndexedDB, config.json…) is «Інше». */
export function classifyPath(abs: string, layout: StorageLayout): StorageCategory {
  const { platform } = layout
  const n = normPath(abs, platform)
  const db = normPath(layout.dbFile, platform)
  if (n === db || n === db + '-wal' || n === db + '-shm') return 'database'
  if (isInside(abs, layout.filesDir, platform)) return 'files'
  if (isInside(abs, layout.backupsDir, platform)) return 'backups'
  if (isInside(abs, layout.logsDir, platform)) return 'logs'
  if (layout.cacheDirs.some((dir) => isInside(abs, dir, platform))) return 'cache'
  return 'other'
}

/**
 * Every regular file under `dir`. Own recursion instead of `readdir({ recursive })`: one unreadable
 * subfolder (locked by another process) is skipped instead of failing the whole walk. Symlinks and
 * junctions are not followed (a Dirent of a link is neither a file nor a directory).
 */
async function collectFiles(dir: string, out: string[]): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    if (SKIPPED.has((e as NodeJS.ErrnoException).code ?? '')) return
    throw e
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectFiles(abs, out)
    else if (entry.isFile()) out.push(abs)
  }
}

/** Sizes of files in batches; a file gone between readdir and stat (or locked) is skipped. */
async function statSizes(files: string[]): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = []
  for (let i = 0; i < files.length; i += STAT_BATCH) {
    const batch = await Promise.all(
      files.slice(i, i + STAT_BATCH).map(async (f) => {
        try {
          return { path: f, size: (await stat(f)).size }
        } catch (e) {
          if (SKIPPED.has((e as NodeJS.ErrnoException).code ?? '')) return null
          throw e
        }
      })
    )
    for (const r of batch) if (r) out.push(r)
  }
  return out
}

/** Bytes and file count per category over all roots; a file is counted once. */
export async function walkSizes(layout: StorageLayout): Promise<Sizes> {
  const sizes: Sizes = {
    database: { bytes: 0, count: 0 },
    files: { bytes: 0, count: 0 },
    backups: { bytes: 0, count: 0 },
    logs: { bytes: 0, count: 0 },
    cache: { bytes: 0, count: 0 },
    other: { bytes: 0, count: 0 }
  }
  const seen = new Set<string>()
  const files: string[] = []
  for (const root of layout.roots) {
    const found: string[] = []
    await collectFiles(root, found)
    for (const f of found) {
      const key = normPath(f, layout.platform)
      if (seen.has(key)) continue
      seen.add(key)
      files.push(f)
    }
  }
  for (const { path: f, size } of await statSizes(files)) {
    const c = sizes[classifyPath(f, layout)]
    c.bytes += size
    c.count++
  }
  return sizes
}

/** Total size of a folder (the installed program); a missing folder is 0. */
export async function dirSize(dir: string): Promise<number> {
  const files: string[] = []
  await collectFiles(dir, files)
  return (await statSizes(files)).reduce((sum, f) => sum + f.size, 0)
}

/** Files directly in `dir` (no subfolders) with their sizes; a missing folder is an empty list. */
export async function listFiles(dir: string): Promise<{ path: string; size: number }[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    if (SKIPPED.has((e as NodeJS.ErrnoException).code ?? '')) return []
    throw e
  }
  return statSizes(entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name)))
}

/** The log folder is ours to clean only when it lies inside userData (never another app's or the installed Vault's). */
export function logsDirIsOwn(layout: StorageLayout): boolean {
  const { platform } = layout
  return (
    isInside(layout.logsDir, layout.userData, platform) &&
    normPath(layout.logsDir, platform) !== normPath(layout.userData, platform)
  )
}

/** Rotated logs «Видалити старі» removes: `*.log` directly in the log folder, except the current one. */
export function planOldLogs(
  files: { path: string; size: number }[],
  currentLog: string,
  layout: StorageLayout
): { path: string; size: number }[] {
  if (!logsDirIsOwn(layout)) return []
  const { platform } = layout
  const p = pathOf(platform)
  const dir = normPath(layout.logsDir, platform)
  const current = normPath(currentLog, platform)
  return files.filter((f) => {
    const n = normPath(f.path, platform)
    return p.dirname(n) === dir && n !== current && n.endsWith('.log')
  })
}
