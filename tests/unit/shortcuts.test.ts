/** Global quick-add hotkey: a busy/invalid choice never leaves the user without a working one. */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const taken = new Set(['Ctrl+Shift+B'])
const active = new Set<string>()
vi.mock('electron', () => ({
  app: { on: () => undefined },
  globalShortcut: {
    register: (accel: string) => {
      if (accel === 'Bad+') throw new Error('invalid')
      if (taken.has(accel)) return false
      active.add(accel)
      return true
    },
    unregister: (accel: string) => active.delete(accel),
    unregisterAll: () => active.clear()
  }
}))

const { ShortcutController } = await import('@main/system/shortcuts')
const { ConfigStore } = await import('@main/core/config-store')

function setup(saved: string): {
  config: InstanceType<typeof ConfigStore>
  sc: InstanceType<typeof ShortcutController>
} {
  active.clear()
  const config = new ConfigStore(join(mkdtempSync(join(tmpdir(), 'vault-cfg-')), 'config.json'))
  config.updateSettings({ quickAddShortcut: saved })
  const sc = new ShortcutController(config, { showQuickAdd: () => undefined } as never)
  return { config, sc }
}

describe('ShortcutController', () => {
  it('a busy new hotkey is refused and the old one keeps working', () => {
    const { sc } = setup('Ctrl+Shift+A')
    expect(sc.register()).toBe(true)
    expect(sc.apply('Ctrl+Shift+B')).toMatch(/зайняла/)
    expect(sc.apply('Bad+')).toMatch(/не можна використати/)
    expect([...active]).toEqual(['Ctrl+Shift+A'])
  })

  it('switching to a free hotkey releases the old one', () => {
    const { sc } = setup('Ctrl+Shift+A')
    sc.register()
    expect(sc.apply('Ctrl+Shift+C')).toBeNull()
    expect([...active]).toEqual(['Ctrl+Shift+C'])
  })

  it('a hotkey busy at startup does not turn unrelated settings into errors', () => {
    const { config, sc } = setup('Ctrl+Shift+B')
    expect(sc.register()).toBe(false)
    expect(() => config.updateSettings({ theme: 'dark' })).not.toThrow()
    expect(sc.lastError).toMatch(/зайняла/)
    taken.delete('Ctrl+Shift+B')
    config.updateSettings({ theme: 'light' })
    expect(sc.lastError).toBeNull()
    expect([...active]).toEqual(['Ctrl+Shift+B'])
  })
})

describe('Ctrl+B (fold the sidebar)', async () => {
  const { isSidebarToggle, shortcutGroups } = await import('@/app/shortcuts')
  const key = (over: Partial<KeyboardEvent>): Parameters<typeof isSidebarToggle>[0] => ({
    code: 'KeyB',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...over
  })

  it('matches Ctrl/Cmd+B by the physical key (any layout)', () => {
    expect(isSidebarToggle(key({ ctrlKey: true }))).toBe(true)
    expect(isSidebarToggle(key({ metaKey: true }))).toBe(true)
  })

  it('not with Shift or Alt, not on auto-repeat, not another key, not without a modifier', () => {
    expect(isSidebarToggle(key({ ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isSidebarToggle(key({ ctrlKey: true, altKey: true }))).toBe(false)
    expect(isSidebarToggle(key({ ctrlKey: true, repeat: true }))).toBe(false)
    expect(isSidebarToggle(key({ ctrlKey: true, code: 'KeyN' }))).toBe(false)
    expect(isSidebarToggle(key({}))).toBe(false)
  })

  it('is listed in the Ctrl+/ help under «Всюди»', () => {
    const everywhere = shortcutGroups('CommandOrControl+Shift+Space').find(
      (g) => g.title === 'Всюди'
    )
    expect(everywhere?.items.map((i) => i.keys)).toContainEqual(['Ctrl', 'B'])
  })
})
