import { app, BrowserWindow, dialog, nativeTheme, session } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Container } from './container'
import { log, logFilePath, setupLogging } from './core/logger'
import { registerRpc } from './ipc/rpc'
import { handleAppProtocol, handleFileProtocol, registerSchemes } from './system/protocols'
import { applyAutostart, HIDDEN_ARG, launchedHidden } from './system/autostart'
import { setNotificationPrefix } from './core/notify'
import {
  resolveProfile,
  samePath,
  seedSandboxConfig,
  wipeSandboxData,
  writeMarker
} from './core/profile'
import type { ProfileKind } from '@shared/domain/sandbox'

const APP_ID = 'dev.vault.app'

// `npm run dev` must never touch the real data of the installed app (Windows paths are case-insensitive,
// so %APPDATA%/vault and %APPDATA%/Vault are the same folder). Tests pass their own --user-data-dir.
// setPath throws on a folder that does not exist yet (a fresh machine).
if (!app.isPackaged && !process.argv.some((a) => a.startsWith('--user-data-dir'))) {
  const dev = join(app.getPath('appData'), 'vault-dev')
  mkdirSync(dev, { recursive: true })
  app.setPath('userData', dev)
}

// «Тестовий режим» is a process flag, never a setting: a normal start always opens the real data. The order
// below matters: the lock is taken on the MAIN folder before userData moves, so the real and the test Vault
// never run at the same time (one tray, one hotkey, one extension port).
const profile = resolveProfile(process.argv, app.getPath('userData'))
const gotLock = app.requestSingleInstanceLock({ profile: profile.kind })
if (gotLock && profile.kind === 'sandbox') {
  mkdirSync(profile.sandboxUserData, { recursive: true })
  app.setPath('userData', profile.sandboxUserData)
  // Explicitly, not relying on «sessionData defaults to userData»: cookies, caches, localStorage stay apart.
  app.setPath('sessionData', profile.sandboxUserData)
  if (samePath(app.getPath('userData'), profile.mainUserData))
    throw new Error('[sandbox] resolved to the main profile')
}

setupLogging({ dir: join(app.getPath('userData'), 'logs'), profile: profile.kind })
if (profile.kind === 'sandbox') setNotificationPrefix('Тест · ')
registerSchemes()

if (!gotLock) {
  app.quit()
} else {
  let container: Container | null = null
  // Wiping the test data («Очистити тестові дані» inside the sandbox) happens before the database opens.
  let resetFailed = false
  if (profile.kind === 'sandbox') {
    if (profile.reset) {
      try {
        wipeSandboxData(profile)
      } catch (e) {
        resetFailed = true
        log.error('[sandbox] reset', e)
      }
    }
    try {
      writeMarker(profile)
      seedSandboxConfig(profile)
    } catch (e) {
      log.error('[sandbox] prepare', e)
    }
  }

  // A second launch (shortcut, autostart) while Vault runs: show this window; say which data it holds when
  // the launch asked for the other profile.
  app.on('second-instance', (_e, argv, _cwd, data) => {
    if (!container || argv.includes(HIDDEN_ARG)) return
    container.windows.showMain()
    const wanted = (data as { profile?: ProfileKind } | null)?.profile ?? 'main'
    if (wanted === profile.kind) return
    container.bus.emit('toast', {
      kind: 'info',
      message:
        profile.kind === 'sandbox'
          ? 'Vault зараз у тестовому режимі. Щоб повернутися до своїх даних — «Вийти…» у бічній панелі або Налаштування → «Вийти з тестового режиму».'
          : 'Vault уже відкрито з вашими даними. Тестовий режим вмикається в Налаштуваннях.'
    })
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_ID)
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    // Deny every web permission except the few the UI uses (camera, mic, location, USB… are never needed).
    const ALLOWED_PERMISSIONS = new Set([
      'clipboard-read',
      'clipboard-sanitized-write',
      'notifications',
      'fullscreen'
    ])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(ALLOWED_PERMISSIONS.has(permission))
    )
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      ALLOWED_PERMISSIONS.has(permission)
    )

    // The container prepares the data folder and reads config.json: a failure here (no access to the
    // folder, a disk error) must show the same window instead of leaving a silent background process.
    let c: Container
    try {
      c = new Container(icon, profile)
    } catch (e) {
      log.error('[startup] container', e)
      dialog.showErrorBox(
        'Vault не запустився',
        `Не вдалося підготувати папку даних — подробиці в журналі: ${logFilePath()}.`
      )
      app.exit(1)
      return
    }
    // A locked/corrupt database, a failed migration or a failed startup step: say so and exit instead of
    // hanging in the background with the single-instance lock (every next launch would just do nothing).
    // The technical cause (English SQLite/drizzle text) goes to the log only.
    const fail = (message: string, e: unknown): void => {
      log.error('[startup]', message, e)
      dialog.showErrorBox(
        'Vault не запустився',
        `${message} Бекапи — у папці ${c.paths.backupsDir}, подробиці — у журналі: ${logFilePath()}.`
      )
      app.exit(1)
    }
    try {
      c.openDb()
    } catch (e) {
      fail('Не вдалося відкрити базу даних. Дані не змінено.', e)
      return
    }
    try {
      c.init()
    } catch (e) {
      // The database is open and housekeeping may have changed it already: no «Дані не змінено» here.
      fail('Vault не зміг завершити запуск.', e)
      return
    }
    container = c

    nativeTheme.themeSource = c.config.settings.theme
    c.config.onSettingsChange((s) => {
      nativeTheme.themeSource = s.theme
    })

    handleFileProtocol(c.files)
    handleAppProtocol(c.paths.rendererDir)
    registerRpc(c.api, c.bus)

    const s = c.config.settings
    applyAutostart(s.launchAtLogin, profile.kind)
    const hidden = launchedHidden() && s.startHidden
    const main = c.windows.createMain({ show: !hidden })
    c.tray.create()
    if (resetFailed) {
      main.webContents.once('did-finish-load', () =>
        setTimeout(
          () =>
            c.bus.emit('toast', {
              kind: 'error',
              message:
                'Не вдалося очистити тестові дані — файли тримає інша програма. Відкрито попередні тестові дані.'
            }),
          1500
        )
      )
    }
    if (!c.shortcuts.register()) {
      log.warn('[shortcut]', c.shortcuts.lastError)
      // The renderer subscribes to toasts after its first render, a moment after the page has loaded.
      // Unpackaged runs (npm run dev, e2e) only log it: the installed Vault next to them holds the hotkey anyway,
      // and a toast on every start stacked over the ones a test clicks.
      if (app.isPackaged)
        main.webContents.once('did-finish-load', () =>
          setTimeout(() => {
            if (c.shortcuts.lastError) {
              c.bus.emit('toast', {
                kind: 'error',
                message: `${c.shortcuts.lastError} — змініть її: Налаштування → Система → «Швидке додавання»`
              })
            }
          }, 1500)
        )
    }
    c.reminders.start()
    c.backup.startAuto()
    c.updater.startAuto()
    c.capture.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) c.windows.createMain({ show: true })
      else c.windows.showMain()
    })
  })

  // Keep running in the tray when every window is closed/hidden.
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return
    if (!container?.config.settings.closeToTray) app.quit()
  })

  app.on('will-quit', () => container?.dispose())
}
