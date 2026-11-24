import { app, BrowserWindow, nativeTheme, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Container } from './container'
import { setupLogging } from './core/logger'
import { registerRpc } from './ipc/rpc'
import { handleAppProtocol, handleFileProtocol, registerSchemes } from './system/protocols'
import { applyAutostart, launchedHidden } from './system/autostart'

const APP_ID = 'dev.vault.app'

// `npm run dev` must never touch the real data of the installed app (Windows paths are case-insensitive,
// so %APPDATA%/vault and %APPDATA%/Vault are the same folder). Tests pass their own --user-data-dir.
if (!app.isPackaged && !process.argv.some((a) => a.startsWith('--user-data-dir'))) {
  app.setPath('userData', join(app.getPath('appData'), 'vault-dev'))
}

setupLogging()
registerSchemes()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let container: Container | null = null

  app.on('second-instance', () => container?.windows.showMain())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_ID)
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    // Deny every web permission except the few the UI uses (camera, mic, location, USB… are never needed).
    const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen'])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))

    const c = new Container(icon)
    container = c
    c.init()

    nativeTheme.themeSource = c.config.settings.theme
    c.config.onSettingsChange((s) => {
      nativeTheme.themeSource = s.theme
    })

    handleFileProtocol(c.files)
    handleAppProtocol(c.paths.rendererDir)
    registerRpc(c.api, c.bus)

    const s = c.config.settings
    applyAutostart(s.launchAtLogin)
    const hidden = launchedHidden() && s.startHidden
    c.windows.createMain({ show: !hidden })
    c.tray.create()
    c.shortcuts.register()
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

  app.on('will-quit', () => {
    container?.reminders.stop()
    container?.devProjects.killAll()
    container?.capture.stop()
    container?.backup.stop()
    container?.updater.stop()
    container?.config.flush()
    container?.db.close()
  })
}
