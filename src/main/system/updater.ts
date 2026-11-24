import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/domain/system'
import type { EventBus } from '../core/event-bus'
import type { ConfigStore } from '../core/config-store'

const { autoUpdater } = electronUpdater

/** Wraps electron-updater: GitHub Releases (configured in electron-builder.yml → publish). */
export class Updater {
  private status: UpdateStatus = { state: 'idle' }
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly bus: EventBus,
    private readonly config: ConfigStore
  ) {
    if (!app.isPackaged) {
      this.status = { state: 'disabled', reason: 'Оновлення працюють лише в зібраній версії' }
      return
    }
    autoUpdater.autoDownload = config.settings.autoUpdate
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-available', (i) => this.set({ state: 'available', version: i.version }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'none' }))
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => this.set({ state: 'ready', version: i.version }))
    autoUpdater.on('error', (e) => this.set({ state: 'error', message: e?.message ?? String(e) }))
    config.onSettingsChange((s) => {
      autoUpdater.autoDownload = s.autoUpdate
    })
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.bus.emit('updates:status', status)
  }

  get(): UpdateStatus {
    return this.status
  }

  async check(): Promise<UpdateStatus> {
    if (this.status.state === 'disabled') return this.status
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      this.set({ state: 'error', message: (e as Error).message })
    }
    return this.status
  }

  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall()
    else if (this.status.state === 'available') void autoUpdater.downloadUpdate()
  }

  startAuto(): void {
    if (this.status.state === 'disabled') return
    setTimeout(() => {
      if (this.config.settings.autoUpdate) void this.check()
    }, 15_000)
    this.timer = setInterval(() => {
      if (this.config.settings.autoUpdate) void this.check()
    }, 6 * 3600_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }
}
