import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import type { ConfigStore } from '../core/config-store'
import type { WindowManager } from './window-manager'

/** What the tray needs from time tracking (CRM). */
export interface TrayTimer {
  running(): { projectId: string; projectTitle: string; startedAt: number } | null
  projects(): { id: string; title: string }[]
  start(projectId: string): Promise<unknown>
  stop(): Promise<unknown>
  /** Subscribe to data changes; returns unsubscribe. */
  onChange(cb: () => void): () => void
}

const elapsed = (from: number): string => {
  const m = Math.max(0, Math.floor((Date.now() - from) / 60000))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** System tray icon with quick actions. */
export class TrayController {
  private tray: Tray | null = null

  constructor(
    private readonly windows: WindowManager,
    private readonly config: ConfigStore,
    private readonly iconPath: string,
    private readonly onToggleAutostart: (enabled: boolean) => void,
    private readonly timer?: TrayTimer
  ) {
    config.onSettingsChange(() => this.refresh())
    // Timer started/stopped anywhere (window, tray) → menu and tooltip follow; tick once a minute while running.
    let pending: NodeJS.Timeout | null = null
    timer?.onChange(() => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => this.refresh(), 300)
    })
    setInterval(() => {
      const run = this.timer?.running()
      if (!run) return
      this.refresh()
      this.warnIfForgotten(run)
    }, 60_000)
  }

  /** Start time of the run we already warned about (one notification per forgotten run). */
  private warnedFor = 0

  /** A timer running 12+ hours is most likely forgotten: say so once, click opens the project. */
  private warnIfForgotten(run: { projectId: string; projectTitle: string; startedAt: number }): void {
    if (Date.now() - run.startedAt < 12 * 3600_000 || this.warnedFor === run.startedAt) return
    this.warnedFor = run.startedAt
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: 'Таймер іде вже понад 12 годин',
      body: `${run.projectTitle} · ${elapsed(run.startedAt)}. Можливо, його забули зупинити — відкрийте проєкт і виправте час.`
    })
    n.on('click', () => this.windows.showMain(`/projects/${run.projectId}`))
    n.show()
  }

  private timerItems(): Electron.MenuItemConstructorOptions[] {
    if (!this.timer) return []
    const run = this.timer.running()
    if (run) {
      return [
        { label: `⏱  ${run.projectTitle} · ${elapsed(run.startedAt)}`, enabled: false },
        { label: 'Зупинити таймер', click: () => void this.timer!.stop() },
        { label: 'Відкрити проєкт', click: () => this.windows.showMain(`/projects/${run.projectId}`) }
      ]
    }
    const list = this.timer.projects()
    return [
      {
        label: 'Почати таймер',
        enabled: list.length > 0,
        submenu: list.length
          ? list.map((p) => ({ label: p.title, click: () => void this.timer!.start(p.id) }))
          : [{ label: 'Немає активних проєктів', enabled: false }]
      }
    ]
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
    const run = this.timer?.running()
    this.tray.setToolTip(run ? `Vault · ⏱ ${run.projectTitle} ${elapsed(run.startedAt)}` : 'Vault')
    const accel = s.quickAddShortcut.replace('CommandOrControl', 'Ctrl')
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Відкрити Vault', click: () => this.windows.showMain() },
        { label: `Швидко додати    ${accel}`, click: () => this.windows.showQuickAdd() },
        { label: 'Пошук', click: () => this.windows.showMain('/?search=1') },
        { type: 'separator' },
        ...this.timerItems(),
        ...(this.timer ? [{ type: 'separator' as const }] : []),
        {
          label: 'Запускати разом із Windows',
          type: 'checkbox',
          checked: s.launchAtLogin,
          click: (item) => this.onToggleAutostart(item.checked)
        },
        { type: 'separator' },
        { label: 'Вийти', click: () => app.quit() }
      ])
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
