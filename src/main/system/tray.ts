import { app, Menu, nativeImage, Tray } from 'electron'
import type { ConfigStore } from '../core/config-store'
import type { WindowManager } from './window-manager'

/** System tray icon with quick actions. */
export class TrayController {
  private tray: Tray | null = null

  constructor(
    private readonly windows: WindowManager,
    private readonly config: ConfigStore,
    private readonly iconPath: string,
    private readonly onToggleAutostart: (enabled: boolean) => void
  ) {
    config.onSettingsChange(() => this.refresh())
  }

  create(): void {
    const image = nativeImage.createFromPath(this.iconPath).resize({ width: 16, height: 16 })
    this.tray = new Tray(image)
    this.tray.setToolTip('Vault')
    this.tray.on('click', () => this.windows.toggleMain())
    this.refresh()
  }

  refresh(): void {
    if (!this.tray) return
    const s = this.config.settings
    const accel = s.quickAddShortcut.replace('CommandOrControl', 'Ctrl')
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Открыть Vault', click: () => this.windows.showMain() },
        { label: `Быстро добавить    ${accel}`, click: () => this.windows.showQuickAdd() },
        { label: 'Поиск', click: () => this.windows.showMain('/?search=1') },
        { type: 'separator' },
        {
          label: 'Запускать вместе с Windows',
          type: 'checkbox',
          checked: s.launchAtLogin,
          click: (item) => this.onToggleAutostart(item.checked)
        },
        { type: 'separator' },
        { label: 'Выйти', click: () => app.quit() }
      ])
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
