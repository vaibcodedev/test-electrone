/** Folded sidebar: the state lives in ui-store (zustand persist) and survives restarts; bad saved values don't stick. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v))
  }
}

async function loadStore(saved?: unknown): Promise<{
  useUi: (typeof import('@/stores/ui-store'))['useUi']
  storage: Storage
}> {
  const storage = memoryStorage(saved === undefined ? {} : { 'vault-ui': JSON.stringify(saved) })
  // zustand's default storage is `window.localStorage`, read lazily when the store is created.
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage })
  vi.resetModules()
  const { useUi } = await import('@/stores/ui-store')
  return { useUi, storage }
}

describe('sidebarOpen', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts expanded and toggles', async () => {
    const { useUi } = await loadStore()
    expect(useUi.getState().sidebarOpen).toBe(true)
    useUi.getState().toggleSidebar()
    expect(useUi.getState().sidebarOpen).toBe(false)
    useUi.getState().toggleSidebar()
    expect(useUi.getState().sidebarOpen).toBe(true)
    useUi.getState().setSidebarOpen(false)
    expect(useUi.getState().sidebarOpen).toBe(false)
  })

  it('is persisted with views and open hubs, transient flags are not', async () => {
    const { useUi, storage } = await loadStore()
    const saved = useUi.persist.getOptions().partialize?.(useUi.getState()) as Record<
      string,
      unknown
    >
    expect(Object.keys(saved)).toEqual(expect.arrayContaining(['sidebarOpen', 'views', 'openHubs']))
    expect(saved).not.toHaveProperty('paletteOpen')
    useUi.getState().setSidebarOpen(false)
    expect(storage.getItem('vault-ui')).toContain('"sidebarOpen":false')
  })

  it('older saved state without the field opens expanded and keeps the rest', async () => {
    const { useUi } = await loadStore({
      state: { views: { boards: 'kanban' }, openHubs: { work: true } },
      version: 0
    })
    expect(useUi.getState().sidebarOpen).toBe(true)
    expect(useUi.getState().views).toEqual({ boards: 'kanban' })
  })

  it('a saved value that is not a boolean is ignored', async () => {
    const { useUi } = await loadStore({ state: { sidebarOpen: 'no' }, version: 0 })
    expect(useUi.getState().sidebarOpen).toBe(true)
  })

  it('a saved folded state is restored', async () => {
    const { useUi } = await loadStore({ state: { sidebarOpen: false }, version: 0 })
    expect(useUi.getState().sidebarOpen).toBe(false)
  })
})
