import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { TextMenuController } from '@main/system/text-menu'

vi.mock('@main/core/logger', () => ({ log: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@main/ipc/rpc', () => ({ isAppPageUrl: () => true }))

/** A window's webContents as the controller sees it; `open` plays Chromium's right click on a field. */
function fakeWindow() {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  const copy = vi.fn()
  const send = vi.fn()
  const contents = {
    on: (event: string, fn: (...args: unknown[]) => void) => (handlers[event] = fn),
    once: (event: string, fn: (...args: unknown[]) => void) => (handlers[event] = fn),
    send,
    copy,
    getZoomFactor: () => 1,
    isDestroyed: () => false
  } as unknown as WebContents
  const open = (): number => {
    handlers['context-menu'](null, {
      frame: { parent: null, url: 'app' },
      x: 1,
      y: 1,
      isEditable: true,
      selectionText: 'a',
      linkURL: '',
      misspelledWord: '',
      dictionarySuggestions: [],
      formControlType: 'text-area',
      menuSourceType: 'mouse',
      editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }
    })
    return (send.mock.lastCall![1] as { id: number }).id
  }
  return { contents, copy, open, destroy: () => handlers.destroyed() }
}

describe('TextMenuController', () => {
  it('a menu in one window does not make another window’s menu stale; each works once', async () => {
    const controller = new TextMenuController()
    const main = fakeWindow()
    const popup = fakeWindow()
    controller.attach(main.contents)
    controller.attach(popup.contents)
    const first = main.open()
    const second = popup.open()
    const api = controller.api()

    await api.edit({ id: first, command: 'copy' })
    await api.edit({ id: second, command: 'copy' })
    expect(main.copy).toHaveBeenCalledTimes(1)
    expect(popup.copy).toHaveBeenCalledTimes(1)
    await expect(api.edit({ id: first, command: 'copy' })).rejects.toThrow('Меню застаріло')
  })

  it('only the latest menu of a window works, and none after the window is gone', async () => {
    const controller = new TextMenuController()
    const win = fakeWindow()
    controller.attach(win.contents)
    const old = win.open()
    const latest = win.open()
    const api = controller.api()

    await expect(api.edit({ id: old, command: 'copy' })).rejects.toThrow('Меню застаріло')
    win.destroy()
    await expect(api.edit({ id: latest, command: 'copy' })).rejects.toThrow('Меню застаріло')
    expect(win.copy).not.toHaveBeenCalled()
  })
})
