import { app, globalShortcut } from 'electron'
import type { ConfigStore } from '../core/config-store'
import type { WindowManager } from './window-manager'

/** Global hotkey for quick add — works while the app is minimized or hidden in the tray. */
export class ShortcutController {
  private current: string | null = null
  lastError: string | null = null

  constructor(
    private readonly config: ConfigStore,
    private readonly windows: WindowManager
  ) {
    config.onSettingsChange((s) => {
      if (s.quickAddShortcut !== this.current) this.register()
    })
    app.on('will-quit', () => globalShortcut.unregisterAll())
  }

  register(): boolean {
    if (this.current) globalShortcut.unregister(this.current)
    const accel = this.config.settings.quickAddShortcut
    this.current = null
    try {
      const ok = globalShortcut.register(accel, () => this.windows.showQuickAdd())
      if (!ok) {
        this.lastError = `Сочетание ${accel} занято другой программой`
        return false
      }
      this.current = accel
      this.lastError = null
      return true
    } catch {
      this.lastError = `Некорректное сочетание: ${accel}`
      return false
    }
  }
}
