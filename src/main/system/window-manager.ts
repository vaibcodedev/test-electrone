import { app, BrowserWindow, nativeTheme, screen, shell, type Rectangle } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ConfigStore, WindowState } from '../core/config-store'
import type { EventBus } from '../core/event-bus'

const MIN = { width: 960, height: 640 }

const OVERLAY = {
  light: { color: '#d9ddd3', symbolColor: '#1a1c17' },
  dark: { color: '#0d0e0c', symbolColor: '#e9ebe4' }
}

/** Loads a renderer route in a window (dev server in dev, app:// in production). */
function loadRoute(win: BrowserWindow, route: string): void {
  const hash = route.startsWith('/') ? route : `/${route}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#${hash}`)
  } else {
    void win.loadURL(`app://renderer/index.html#${hash}`)
  }
}

function isVisibleOnSomeDisplay(b: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: d }) => {
    const overlapX = Math.min(b.x + b.width, d.x + d.width) - Math.max(b.x, d.x)
    const overlapY = Math.min(b.y + b.height, d.y + d.height) - Math.max(b.y, d.y)
    return overlapX > 120 && overlapY > 80
  })
}

/** Creates and owns the main window and the quick-add popup. */
export class WindowManager {
  main: BrowserWindow | null = null
  quickAdd: BrowserWindow | null = null
  quitting = false

  constructor(
    private readonly config: ConfigStore,
    private readonly bus: EventBus,
    private readonly icon: string
  ) {
    app.on('before-quit', () => {
      this.quitting = true
    })
    nativeTheme.on('updated', () => {
      this.shownTheme = null
      this.applyOverlay()
    })
  }

  /**
   * UI is Ukrainian: spellcheck Ukrainian + English (Windows/Linux; macOS detects the language itself).
   * Unknown codes throw, so only languages the runtime actually has are passed.
   */
  private setSpellcheck(win: BrowserWindow): void {
    if (process.platform === 'darwin') return
    const ses = win.webContents.session
    const langs = ['uk', 'en-US'].filter((l) => ses.availableSpellCheckerLanguages.includes(l))
    if (langs.length) ses.setSpellCheckerLanguages(langs)
  }

  private secure(win: BrowserWindow): void {
    this.setSpellcheck(win)
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      const allowed = url.startsWith('app://renderer/') || (is.dev && url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\0'))
      if (!allowed) {
        event.preventDefault()
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      }
    })
    win.webContents.on('will-attach-webview', (e) => e.preventDefault())
  }

  private webPreferences(): Electron.WebPreferences {
    return {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  }

  /** Last theme the renderer reported; it wins over nativeTheme because it is what the user actually sees. */
  private shownTheme: 'light' | 'dark' | null = null

  applyOverlay(theme?: 'light' | 'dark'): void {
    if (theme) this.shownTheme = theme
    if (!this.main || this.main.isDestroyed() || process.platform === 'darwin') return
    const dark = (this.shownTheme ?? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')) === 'dark'
    const palette = dark ? OVERLAY.dark : OVERLAY.light
    try {
      this.main.setTitleBarOverlay({ ...palette, height: 44 })
    } catch {
      /* overlay not enabled */
    }
    this.main.setBackgroundColor(palette.color)
  }

  createMain(opts: { show: boolean }): BrowserWindow {
    const saved = this.config.windowState
    const bounds =
      saved.x !== undefined && saved.y !== undefined && isVisibleOnSomeDisplay(saved as Rectangle)
        ? { x: saved.x, y: saved.y }
        : {}
    const palette = nativeTheme.shouldUseDarkColors ? OVERLAY.dark : OVERLAY.light
    const win = new BrowserWindow({
      ...bounds,
      width: Math.max(saved.width, MIN.width),
      height: Math.max(saved.height, MIN.height),
      minWidth: MIN.width,
      minHeight: MIN.height,
      show: false,
      title: 'Vault',
      icon: this.icon,
      backgroundColor: palette.color,
      titleBarStyle: 'hidden',
      titleBarOverlay: process.platform === 'darwin' ? undefined : { ...palette, height: 44 },
      autoHideMenuBar: true,
      webPreferences: this.webPreferences()
    })
    this.main = win
    this.secure(win)
    if (saved.maximized) win.maximize()

    win.once('ready-to-show', () => {
      if (opts.show) win.show()
    })

    let saveTimer: NodeJS.Timeout | null = null
    const saveState = (): void => {
      if (win.isDestroyed() || win.isMinimized()) return
      const maximized = win.isMaximized()
      const b = maximized ? this.config.windowState : { ...win.getNormalBounds() }
      const state: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized }
      this.config.windowState = state
    }
    const debounced = (): void => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(saveState, 400)
    }
    win.on('resize', debounced)
    win.on('move', debounced)
    win.on('maximize', saveState)
    win.on('unmaximize', saveState)

    win.on('close', (e) => {
      saveState()
      if (!this.quitting && this.config.settings.closeToTray) {
        e.preventDefault()
        win.hide()
      }
    })
    win.on('closed', () => {
      this.main = null
    })

    loadRoute(win, '/')
    return win
  }

  showMain(route?: string): void {
    const win = this.main && !this.main.isDestroyed() ? this.main : this.createMain({ show: true })
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (route) {
      const send = (): void => this.bus.emit('navigate', { route })
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
      else send()
    }
  }

  toggleMain(): void {
    if (this.main && this.main.isVisible() && this.main.isFocused()) this.main.hide()
    else this.showMain()
  }

  private createQuickAdd(): BrowserWindow {
    const win = new BrowserWindow({
      width: 620,
      height: 360,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: true,
      backgroundColor: '#00000000',
      title: 'Швидко додати',
      webPreferences: this.webPreferences()
    })
    this.secure(win)
    win.on('blur', () => {
      if (!is.dev || !win.webContents.isDevToolsOpened()) win.hide()
    })
    win.on('closed', () => {
      this.quickAdd = null
    })
    loadRoute(win, '/quick-add')
    return win
  }

  /** Shows the quick-add popup on the display under the cursor. Works while the main window is hidden. */
  showQuickAdd(target?: string): void {
    const win = this.quickAdd && !this.quickAdd.isDestroyed() ? this.quickAdd : (this.quickAdd = this.createQuickAdd())
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const [w] = win.getSize()
    win.setPosition(Math.round(workArea.x + (workArea.width - w) / 2), Math.round(workArea.y + workArea.height * 0.22))
    const reveal = (): void => {
      win.show()
      win.focus()
      win.webContents.send('quick-add:open', { target })
    }
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal)
    else reveal()
  }

  hideQuickAdd(): void {
    this.quickAdd?.hide()
  }
}
