/**
 * «Сховище»: which row a file lands in, the walk over a real temp folder, and which logs may go.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fsp from 'fs/promises'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { syncBuiltinESMExports } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  classifyPath,
  isInside,
  planOldLogs,
  storageLayout,
  walkSizes,
  type StorageLayout
} from '@main/services/storage-usage'

function layoutAt(root: string, platform: NodeJS.Platform = process.platform): StorageLayout {
  const p = platform === 'win32' ? '\\' : '/'
  const j = (...parts: string[]): string => [root, ...parts].join(p)
  return storageLayout(
    {
      dataDir: j('data'),
      dbFile: j('data', 'vault.db'),
      filesDir: j('data', 'files'),
      backupsDir: j('data', 'backups')
    },
    { userData: root, sessionData: root, logsDir: j('logs') },
    platform
  )
}

describe('classifyPath', () => {
  const root = join(tmpdir(), 'vault-classify')
  const l = layoutAt(root)
  const at = (...parts: string[]): string => join(root, ...parts)

  it('database, its WAL and SHM', () => {
    for (const f of ['vault.db', 'vault.db-wal', 'vault.db-shm'])
      expect(classifyPath(at('data', f), l)).toBe('database')
  })

  it('files, backups, logs', () => {
    expect(classifyPath(at('data', 'files', 'a', 'b.png'), l)).toBe('files')
    expect(classifyPath(at('data', 'backups', 'vault-1.vaultbak'), l)).toBe('backups')
    expect(classifyPath(at('logs', 'main.log'), l)).toBe('logs')
  })

  it('a folder whose name starts like «files» is not files', () => {
    expect(classifyPath(at('data', '.tmp', 'files-before-restore-1', 'x.png'), l)).toBe('other')
    expect(classifyPath(at('data', 'files-before-restore-1', 'x.png'), l)).toBe('other')
  })

  it('cache is only what «Очистити кеш» empties', () => {
    expect(classifyPath(at('Cache', 'Cache_Data', 'f_000001'), l)).toBe('cache')
    expect(classifyPath(at('Code Cache', 'js', 'index'), l)).toBe('cache')
    expect(classifyPath(at('GPUCache', 'data_0'), l)).toBe('cache')
    expect(classifyPath(at('Service Worker', 'CacheStorage', 'x'), l)).toBe('cache')
    expect(classifyPath(at('Service Worker', 'Database', 'x'), l)).toBe('other')
    expect(classifyPath(at('DawnGraphiteCache', 'x'), l)).toBe('other')
    expect(classifyPath(at('Local Storage', 'leveldb', '000.log'), l)).toBe('other')
    expect(classifyPath(at('IndexedDB', 'x'), l)).toBe('other')
    expect(classifyPath(at('config.json'), l)).toBe('other')
  })

  it('Windows paths ignore the drive-letter case', () => {
    const w = layoutAt('C:\\Users\\me\\AppData\\Roaming\\vault', 'win32')
    expect(classifyPath('c:\\users\\me\\appdata\\roaming\\VAULT\\data\\vault.db', w)).toBe(
      'database'
    )
    expect(classifyPath('c:\\Users\\me\\AppData\\Roaming\\vault\\Cache\\x', w)).toBe('cache')
    expect(isInside('C:\\a\\files', 'c:\\A', 'win32')).toBe(true)
    expect(isInside('C:\\a\\files-x', 'C:\\a\\files', 'win32')).toBe(false)
  })

  it('a folder nested in another is walked once', () => {
    expect(l.roots).toEqual([root])
  })
})

describe('walkSizes', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vault-walk-'))
    const put = (rel: string, bytes: number): void => {
      const abs = join(root, rel)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, Buffer.alloc(bytes))
    }
    put('data/vault.db', 100)
    put('data/vault.db-wal', 10)
    put('data/files/a/1.png', 200)
    put('data/files/2.png', 300)
    put('data/backups/vault-1.vaultbak', 400)
    put('logs/main.log', 50)
    put('logs/main.old.log', 60)
    put('Cache/Cache_Data/f', 70)
    put('Local Storage/leveldb/000.log', 5)
    put('config.json', 3)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('sums bytes and counts per category', async () => {
    const s = await walkSizes(layoutAt(root))
    expect(s.database).toEqual({ bytes: 110, count: 2 })
    expect(s.files).toEqual({ bytes: 500, count: 2 })
    expect(s.backups).toEqual({ bytes: 400, count: 1 })
    expect(s.logs).toEqual({ bytes: 110, count: 2 })
    expect(s.cache).toEqual({ bytes: 70, count: 1 })
    expect(s.other).toEqual({ bytes: 8, count: 2 })
  })

  it('nested roots do not count a file twice', async () => {
    const l = layoutAt(root)
    const s = await walkSizes({ ...l, roots: [root, l.dataDir, l.filesDir] })
    expect(s.files).toEqual({ bytes: 500, count: 2 })
  })

  it('a file removed between readdir and stat does not break the walk', async () => {
    const realStat = fsp.stat
    fsp.stat = (async (p: Parameters<typeof realStat>[0]) => {
      if (String(p).endsWith('2.png')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return realStat(p)
    }) as typeof realStat
    syncBuiltinESMExports()
    try {
      const s = await walkSizes(layoutAt(root))
      expect(s.files).toEqual({ bytes: 200, count: 1 })
    } finally {
      fsp.stat = realStat
      syncBuiltinESMExports()
    }
  })

  it('a missing root is zero, not an error', async () => {
    const s = await walkSizes(layoutAt(join(root, 'nope')))
    expect(s.database.bytes).toBe(0)
  })
})

describe('planOldLogs', () => {
  const root = join(tmpdir(), 'vault-logs')
  const l = layoutAt(root)
  const f = (...parts: string[]): { path: string; size: number } => ({
    path: join(root, ...parts),
    size: 1
  })

  it('takes rotated logs and keeps the current one', () => {
    const plan = planOldLogs(
      [f('logs', 'main.log'), f('logs', 'main.old.log'), f('logs', 'notes.txt')],
      join(root, 'logs', 'main.log'),
      l
    )
    expect(plan.map((p) => p.path)).toEqual([join(root, 'logs', 'main.old.log')])
  })

  it('keeps the current log written with another case on Windows', () => {
    const w = layoutAt('C:\\v', 'win32')
    const plan = planOldLogs(
      [
        { path: 'C:\\v\\logs\\main.log', size: 1 },
        { path: 'C:\\v\\logs\\main.old.log', size: 1 }
      ],
      'c:\\V\\LOGS\\MAIN.LOG',
      w
    )
    expect(plan.map((p) => p.path)).toEqual(['C:\\v\\logs\\main.old.log'])
  })

  it('a log folder outside userData is never cleaned', () => {
    const outside = { ...l, logsDir: join(tmpdir(), 'vault-installed', 'logs') }
    expect(
      planOldLogs([{ path: join(outside.logsDir, 'main.old.log'), size: 1 }], 'x', outside)
    ).toEqual([])
  })

  it('files in subfolders are not taken', () => {
    expect(planOldLogs([f('logs', 'sub', 'old.log')], join(root, 'logs', 'main.log'), l)).toEqual(
      []
    )
  })
})
