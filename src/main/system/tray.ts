import { app, Menu, nativeImage, Tray } from 'electron'
import { showNotification } from '../core/notify'
import type { ConfigStore } from '../core/config-store'
import type { ProfileKind } from '@shared/domain/sandbox'
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

/** 0:03:12 — with seconds, so a freshly started timer visibly runs (minutes alone stayed «0:00»). */
const elapsed = (from: number): string => {
  const sec = Math.max(0, Math.floor((Date.now() - from) / 1000))
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`
}

/** System tray icon with quick actions. */
export class TrayController {
  private tray: Tray | null = null
  private ticker: NodeJS.Timeout | null = null

  constructor(
    private readonly windows: WindowManager,
    private readonly config: ConfigStore,
    private readonly iconPath: string,
    private readonly onToggleAutostart: (enabled: boolean) => void,
    private readonly profile: ProfileKind = 'main',
    private readonly timer?: TrayTimer
  ) {
    config.onSettingsChange(() => this.refresh())
    // Timer started/stopped anywhere (window, tray) → menu and tooltip follow; tick once a minute while running.
    let pending: NodeJS.Timeout | null = null
    timer?.onChange(() => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => this.refresh(), 300)
    })
    // Tooltip follows every 5 s while running; the menu itself is rebuilt each time it opens (see create()).
    this.ticker = setInterval(() => {
      const run = this.timer?.running()
      if (!run) return
      this.refresh()
      this.warnIfForgotten(run)
    }, 5_000)
  }

  /** Start time of the run we already warned about (one notification per forgotten run). */
  private warnedFor = 0

  /** A timer running 12+ hours is most likely forgotten: say so once, click opens the project. */
  private warnIfForgotten(run: { projectId: string; projectTitle: string; startedAt: number }): void {
    if (Date.now() - run.startedAt < 12 * 3600_000 || this.warnedFor === run.startedAt) return
    this.warnedFor = run.startedAt
    showNotification(
      {
        title: 'Таймер іде вже понад 12 годин',
        body: `${run.projectTitle} · ${elapsed(run.startedAt)}. Можливо, його забули зупинити — відкрийте проєкт і виправте час.`
      },
      () => this.windows.showMain(`/projects/${run.projectId}`)
    )
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
    this.tray.setToolTip(this.name)
    this.tray.on('click', () => this.windows.toggleMain())
    // Windows shows a snapshot of the context menu: build it at the moment of opening, so the time is current.
    // Windows only: Linux trays have no right-click event (they get setContextMenu in refresh, like macOS).
    if (process.platform === 'win32') this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.menu()))
    this.refresh()
  }

  refresh(): void {
    if (!this.tray) return
    const run = this.timer?.running()
    const short = this.profile === 'sandbox' ? 'Vault · тест' : 'Vault'
    this.tray.setToolTip(run ? `${short} · ⏱ ${run.projectTitle} ${elapsed(run.startedAt)}` : this.name)
    if (process.platform !== 'win32') this.tray.setContextMenu(this.menu())
  }

  private get name(): string {
    return this.profile === 'sandbox' ? 'Vault · тестовий режим' : 'Vault'
  }

  /**
   * «Тестовий режим» items. They only open the settings section: the confirm and saving pending edits happen in
   * the window, so the tray never relaunches by itself.
   */
  private profileItems(): Electron.MenuItemConstructorOptions[] {
    const open = (): void => this.windows.showMain('/settings#sandbox')
    if (this.profile === 'sandbox') {
      return [
        { label: 'Тестовий режим: основні дані не змінюються', enabled: false },
        { label: 'Налаштування тестового режиму…', click: open },
        { type: 'separator' }
      ]
    }
    return []
  }

  private menu(): Menu {
    const s = this.config.settings
    const accel = s.quickAddShortcut.replace('CommandOrControl', 'Ctrl')
    const sandbox = this.profile === 'sandbox'
    return Menu.buildFromTemplate([
        ...this.profileItems(),
        { label: 'Відкрити Vault', click: () => this.windows.showMain() },
        { label: `Швидко додати    ${accel}`, click: () => this.windows.showQuickAdd() },
        { label: 'Пошук', click: () => this.windows.showMain('/?search=1') },
        ...(sandbox
          ? []
          : [{ label: 'Тестовий режим…', click: () => this.windows.showMain('/settings#sandbox') }]),
        { type: 'separator' },
        ...this.timerItems(),
        ...(this.timer ? [{ type: 'separator' as const }] : []),
        // Autostart is one login item per OS and belongs to the real Vault: not offered in the sandbox.
        ...(sandbox
          ? []
          : [
              {
                label: 'Запускати разом із Windows',
                type: 'checkbox' as const,
                checked: s.launchAtLogin,
                click: (item: Electron.MenuItem) => this.onToggleAutostart(item.checked)
              },
              { type: 'separator' as const }
            ]),
        { label: 'Вийти', click: () => app.quit() }
      ])
  }

  destroy(): void {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
    this.tray?.destroy()
    this.tray = null
  }
}
