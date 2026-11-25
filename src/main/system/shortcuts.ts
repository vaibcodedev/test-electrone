import { app, globalShortcut } from 'electron'
import type { ConfigStore } from '../core/config-store'
import type { WindowManager } from './window-manager'

/** Global hotkey for quick add — works while the app is minimized or hidden in the tray. */
export class ShortcutController {
  private current: string | null = null
  /** Why the saved hotkey isn't active (busy or invalid); null while it works. */
  lastError: string | null = null

  constructor(
    private readonly config: ConfigStore,
    private readonly windows: WindowManager
  ) {
    // settings.update applies a new hotkey itself and refuses a bad one before saving. Here a busy hotkey
    // is quietly retried (the other program may have let it go) — never an error for an unrelated setting.
    config.onSettingsChange((s) => {
      if (s.quickAddShortcut !== this.current) this.lastError = this.apply(s.quickAddShortcut)
    })
    app.on('will-quit', () => globalShortcut.unregisterAll())
  }

  /** Startup: registers the saved hotkey. */
  register(): boolean {
    this.lastError = this.apply(this.config.settings.quickAddShortcut)
    return !this.lastError
  }

  /**
   * Switches to `accel`. The old hotkey stays active until the new one is registered, so a busy or
   * invalid choice never leaves the user without one. Returns the error text or null.
   */
  apply(accel: string): string | null {
    if (accel === this.current) return null
    try {
      if (!globalShortcut.register(accel, () => this.windows.showQuickAdd())) {
        return `Комбінацію ${accel} уже зайняла інша програма`
      }
    } catch {
      return `Таку комбінацію не можна використати: ${accel}`
    }
    if (this.current) globalShortcut.unregister(this.current)
    this.current = accel
    this.lastError = null
    return null
  }
}
