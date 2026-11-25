/**
 * «Тестовий режим» in the system parts: no autostart, no updater, «Тест · » in notifications, the log in the
 * profile's own folder.
 */
import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'

const h = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    getVersion: () => 'test',
    getPath: () => '',
    setLoginItemSettings: (opts: unknown): unknown => opts
  },
  shown: [] as { title?: string }[],
  updater: { autoInstallOnAppQuit: true, autoDownload: false, on: () => undefined }
}))

vi.mock('electron', () => {
  class Notification {
    constructor(private readonly opts: { title?: string }) {}
    static isSupported = (): boolean => true
    on(): this {
      return this
    }
    show(): void {
      h.shown.push(this.opts)
    }
  }
  return { app: h.app, Notification, BrowserWindow: { getAllWindows: () => [] } }
})
vi.mock('electron-updater', () => ({ default: { autoUpdater: h.updater } }))
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const { applyAutostart } = await import('@main/system/autostart')
const { setNotificationPrefix, showNotification } = await import('@main/core/notify')
const { Updater } = await import('@main/system/updater')

const config = { settings: { autoUpdate: true }, onSettingsChange: () => () => undefined } as never
const bus = { emit: () => undefined } as never

describe('autostart', () => {
  it('у тестовому режимі запис автозапуску не чіпається', () => {
    const spy = vi.spyOn(h.app, 'setLoginItemSettings')
    applyAutostart(true, 'sandbox')
    expect(spy).not.toHaveBeenCalled()
    applyAutostart(true, 'main')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('updater', () => {
  it('у тестовому режимі вимкнено з причиною, holdInstall нічого не міняє', () => {
    const u = new Updater(bus, config, 'sandbox')
    expect(u.get()).toEqual({ state: 'disabled', reason: 'У тестовому режимі оновлення вимкнено' })
    h.updater.autoInstallOnAppQuit = true
    u.holdInstall()
    expect(h.updater.autoInstallOnAppQuit).toBe(true)
  })
  it('holdInstall в основному профілі прибирає встановлення на виході', () => {
    h.app.isPackaged = false
    process.env.VAULT_SNAP_UPDATE = JSON.stringify({ state: 'ready', version: '9.9.9' })
    try {
      const u = new Updater(bus, config, 'main')
      h.updater.autoInstallOnAppQuit = true
      u.holdInstall()
      expect(h.updater.autoInstallOnAppQuit).toBe(false)
    } finally {
      delete process.env.VAULT_SNAP_UPDATE
      h.app.isPackaged = true
    }
  })
})

describe('notify', () => {
  it('префікс «Тест · » у заголовку', () => {
    setNotificationPrefix('Тест · ')
    showNotification({ title: 'Дзвінок о 15:00' })
    setNotificationPrefix('')
    showNotification({ title: 'Дзвінок о 16:00' })
    expect(h.shown.map((o) => o.title)).toEqual(['Тест · Дзвінок о 15:00', 'Дзвінок о 16:00'])
  })
})

describe('logger', () => {
  it('журнал — у переданій папці', async () => {
    vi.resetModules()
    vi.doUnmock('@main/core/logger')
    vi.doMock('electron-log/main', () => {
      const file: {
        resolvePathFn?: (v: { fileName?: string }) => string
        getFile: () => { path: string }
      } = {
        getFile: () => ({ path: file.resolvePathFn!({ fileName: 'main.log' }) })
      }
      return {
        default: {
          transports: { file, console: {} },
          functions: {},
          errorHandler: { startCatching: () => undefined },
          info: () => undefined
        }
      }
    })
    const { logFilePath, setupLogging } = await import('@main/core/logger')
    const dir = join('C:', 'tmp', 'Vault-sandbox', 'logs')
    setupLogging({ dir, profile: 'sandbox' })
    expect(logFilePath()).toBe(join(dir, 'main.log'))
  })
})
