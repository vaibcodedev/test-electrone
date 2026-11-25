/**
 * «Сховище» service: the cache cleanup never asks Electron to clear user data, sizes are cached but never
 * stale after an action, and a log held by another program does not stop the rest from going.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fsp from 'fs/promises'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { syncBuiltinESMExports } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const { StorageService } = await import('@main/services/storage-service')
const { storageLayout, walkSizes } = await import('@main/services/storage-usage')
type CacheSession = import('@main/services/storage-service').CacheSession

let root: string
let calls: { method: string; arg?: unknown }[]
let walks: number
let pruned: number

const at = (...parts: string[]): string => join(root, ...parts)
function put(rel: string, bytes: number): void {
  const abs = at(rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, Buffer.alloc(bytes))
}

/** A Session stand-in: «clearing» empties the cache folders the way Chromium would. */
function fakeSession(): CacheSession {
  const empty = (dir: string): void => rmSync(at(dir), { recursive: true, force: true })
  return {
    clearCache: async () => {
      calls.push({ method: 'clearCache' })
      empty('Cache')
    },
    clearCodeCaches: async (arg) => {
      calls.push({ method: 'clearCodeCaches', arg })
      empty('Code Cache')
    },
    clearStorageData: async (arg) => {
      calls.push({ method: 'clearStorageData', arg })
      empty('GPUCache')
      empty(join('Service Worker', 'CacheStorage'))
    },
    getCacheSize: async () => {
      calls.push({ method: 'getCacheSize' })
      return 0
    }
  }
}

function service(): InstanceType<typeof StorageService> {
  const layout = storageLayout(
    {
      dataDir: at('data'),
      dbFile: at('data', 'vault.db'),
      filesDir: at('data', 'files'),
      backupsDir: at('data', 'backups')
    },
    { userData: root, sessionData: root, logsDir: at('logs') }
  )
  return new StorageService({
    layout,
    currentLog: () => at('logs', 'main.log'),
    installDir: null,
    session: fakeSession,
    backups: {
      prunePlan: () => [],
      isBusy: () => false,
      pruneOld: async () => {
        pruned++
        return { freedBytes: 0, removed: 0 }
      }
    },
    walk: async (l) => {
      walks++
      return walkSizes(l)
    }
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vault-storage-'))
  calls = []
  walks = 0
  pruned = 0
  put('data/vault.db', 1000)
  put('data/files/a.png', 2000)
  put('data/backups/vault-1.vaultbak', 3000)
  put('logs/main.log', 100)
  put('logs/main.old.log', 400)
  put('Cache/Cache_Data/f', 5000)
  put('Code Cache/js/index', 600)
  put('GPUCache/data_0', 700)
  put('Service Worker/CacheStorage/x', 800)
  put('Local Storage/leveldb/000.log', 50)
  put('IndexedDB/app/000.log', 60)
  put('config.json', 10)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('usage', () => {
  it('rows add up to the total and the current log is in «Інше»', async () => {
    const u = await service().usage()
    expect(u.database.bytes).toBe(1000)
    expect(u.files).toEqual({ bytes: 2000, count: 1 })
    expect(u.backups.count).toBe(1)
    expect(u.logs).toEqual({ bytes: 500, removableBytes: 400 })
    expect(u.cache.bytes).toBe(5000 + 600 + 700 + 800)
    expect(u.other.bytes).toBe(50 + 60 + 10 + 100)
    expect(u.app).toBeNull()
    expect(u.total).toBe(1000 + 2000 + 3000 + 400 + 7100 + 220)
  })

  it('is cached: two calls in a row walk once, recount walks again', async () => {
    const s = service()
    await Promise.all([s.usage(), s.usage()])
    await s.usage()
    expect(walks).toBe(1)
    s.recount()
    await s.usage()
    expect(walks).toBe(2)
  })

  it('a new backup shows up at once, within the cache time', async () => {
    const s = service()
    await s.usage()
    put('data/backups/vault-2.vaultbak', 10)
    const later = new Date(Date.now() + 5000)
    utimesSync(at('data', 'backups'), later, later)
    expect((await s.usage()).backups.count).toBe(2)
    expect(walks).toBe(2)
  })

  it('cleanups drop the cache', async () => {
    const s = service()
    await s.usage()
    await s.clearLogs()
    await s.usage()
    await s.pruneBackups()
    await s.usage()
    expect(pruned).toBe(1)
    expect(walks).toBe(3)
  })
})

describe('clearCache', () => {
  it('asks Electron for exactly the cache, never for user data', async () => {
    const freed = await service().clearCache()
    const clears = calls.filter((c) => c.method !== 'getCacheSize')
    expect(clears).toEqual([
      { method: 'clearCache' },
      { method: 'clearCodeCaches', arg: {} },
      { method: 'clearStorageData', arg: { storages: ['shadercache', 'cachestorage'] } }
    ])
    const storages = (clears[2].arg as { storages?: string[] }).storages
    expect(storages).toBeDefined()
    for (const forbidden of ['localstorage', 'indexdb', 'cookies', 'serviceworkers', 'filesystem'])
      expect(storages).not.toContain(forbidden)
    expect(freed.freedBytes).toBe(7100)
    expect(freed.removed).toBe(4)
  })

  it('local storage, IndexedDB, settings and data stay', async () => {
    await service().clearCache()
    for (const p of [
      at('Local Storage', 'leveldb', '000.log'),
      at('IndexedDB', 'app', '000.log'),
      at('config.json'),
      at('data', 'vault.db'),
      at('data', 'files', 'a.png'),
      at('data', 'backups', 'vault-1.vaultbak')
    ])
      expect(existsSync(p)).toBe(true)
  })

  it('a second click while one runs is refused', async () => {
    const s = service()
    const first = s.clearCache()
    await expect(s.clearCache()).rejects.toThrow('Очищення вже виконується')
    await first
  })
})

describe('clearLogs', () => {
  const realRm = fsp.rm
  let busy: (p: string) => boolean = () => false
  beforeEach(() => {
    fsp.rm = (async (p: Parameters<typeof realRm>[0], o?: Parameters<typeof realRm>[1]) => {
      if (busy(String(p))) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
      return realRm(p, o)
    }) as typeof realRm
    syncBuiltinESMExports()
  })
  afterEach(() => {
    busy = () => false
    fsp.rm = realRm
    syncBuiltinESMExports()
  })

  it('removes rotated logs and keeps the current one', async () => {
    const freed = await service().clearLogs()
    expect(freed).toEqual({ freedBytes: 400, removed: 1 })
    expect(existsSync(at('logs', 'main.log'))).toBe(true)
    expect(existsSync(at('logs', 'main.old.log'))).toBe(false)
  })

  it('a log in use is skipped, the others go', async () => {
    put('logs/renderer.old.log', 30)
    busy = (p) => p.endsWith('main.old.log')
    const freed = await service().clearLogs()
    expect(freed).toEqual({ freedBytes: 30, removed: 1 })
    expect(existsSync(at('logs', 'main.old.log'))).toBe(true)
  })

  it('all in use is a readable error', async () => {
    busy = (p) => p.endsWith('.old.log')
    await expect(service().clearLogs()).rejects.toThrow(/використовує інша програма/)
  })
})

describe('openFolder', () => {
  it('unknown folder is a validation error, the program folder needs the installed app', async () => {
    const api = service().api()
    await expect(api.openFolder({ folder: 'nope' as 'data' })).rejects.toThrow()
    await expect(api.openFolder({ folder: 'app' })).rejects.toThrow(
      'Папка програми є лише у встановленій версії'
    )
  })
})
