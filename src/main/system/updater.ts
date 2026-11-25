import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/domain/system'
import type { ProfileKind } from '@shared/domain/sandbox'
import type { EventBus } from '../core/event-bus'
import type { ConfigStore } from '../core/config-store'
import { log } from '../core/logger'

const { autoUpdater } = electronUpdater

const OFFLINE =
  /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i

/** Wraps electron-updater: GitHub Releases (configured in electron-builder.yml → publish). */
export class Updater {
  private status: UpdateStatus = { state: 'idle' }
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly bus: EventBus,
    private readonly config: ConfigStore,
    profile: ProfileKind = 'main'
  ) {
    // The test Vault never updates or installs: the installed app belongs to the real profile.
    if (profile === 'sandbox') {
      this.status = { state: 'disabled', reason: 'У тестовому режимі оновлення вимкнено' }
      return
    }
    // Screenshot tests only (scripts/snap.mjs), never in an installed build: shows the update plate
    // without a real release. A broken value is ignored instead of breaking the app start.
    const fake = app.isPackaged ? undefined : process.env.VAULT_SNAP_UPDATE
    if (fake) {
      try {
        this.status = JSON.parse(fake) as UpdateStatus
        return
      } catch {
        /* fall through to the normal dev status */
      }
    }
    if (!app.isPackaged) {
      this.status = { state: 'disabled', reason: 'Оновлення працюють лише у встановленій версії' }
      return
    }
    // Placeholder repo in electron-builder.yml → every check is a 404 in the log. Don't go to GitHub at all.
    const feed = join(process.resourcesPath, 'app-update.yml')
    if (!existsSync(feed) || readFileSync(feed, 'utf8').includes('your-github-name')) {
      this.status = { state: 'disabled', reason: 'Репозиторій для оновлень ще не налаштовано' }
      return
    }
    autoUpdater.autoDownload = config.settings.autoUpdate
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    // With auto-download the download starts right away: show progress, not a «Завантажити» button that
    // would start a second download on top of it.
    autoUpdater.on('update-available', (i) =>
      this.set(
        autoUpdater.autoDownload
          ? { state: 'downloading', percent: 0 }
          : { state: 'available', version: i.version }
      )
    )
    autoUpdater.on('update-not-available', () => this.set({ state: 'none' }))
    autoUpdater.on('download-progress', (p) =>
      this.set({ state: 'downloading', percent: Math.round(p.percent) })
    )
    autoUpdater.on('update-downloaded', (i) => this.set({ state: 'ready', version: i.version }))
    autoUpdater.on('error', (e) => this.fail(e))
    config.onSettingsChange((s) => {
      autoUpdater.autoDownload = s.autoUpdate
    })
  }

  /** electron-updater speaks English (net::ERR_…, multi-line HttpError): the details go to the log. */
  private fail(e: unknown): void {
    const downloading = this.status.state === 'downloading'
    const msg = String((e as Error)?.message ?? e)
    const offline = OFFLINE.test(msg)
    // No network on an hourly check is expected, not a bug worth an error in the log.
    if (offline) log.warn('[updater] offline:', msg.split('\n')[0])
    else log.error('[updater]', e)
    this.set({
      state: 'error',
      message: offline
        ? 'Немає зв’язку із сервером оновлень — перевірте інтернет'
        : downloading
          ? 'Не вдалося завантажити оновлення — подробиці в журналі'
          : 'Не вдалося перевірити оновлення — подробиці в журналі'
    })
  }

  /** Same status again (download-progress ticks with an unchanged percent) is not re-sent to the windows. */
  private set(status: UpdateStatus): void {
    if (JSON.stringify(status) === JSON.stringify(this.status)) return
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
      // The 'error' event has usually reported it already; every check passes through 'checking' first.
      if (this.status.state !== 'error') this.fail(e)
    }
    return this.status
  }

  /**
   * Before a relaunch from the main profile («Тестовий режим»): app.exit(0) may still fire 'quit' with code 0,
   * and electron-updater would start the silent installer next to the new instance. The downloaded update
   * installs on the next normal quit instead (it stays in the cache).
   */
  holdInstall(): void {
    if (this.status.state !== 'disabled') autoUpdater.autoInstallOnAppQuit = false
  }

  install(): void {
    if (this.status.state === 'disabled') return
    if (this.status.state === 'ready') autoUpdater.quitAndInstall()
    // A failed download is reported by the 'error' event; the rejected promise has nothing to add.
    else if (this.status.state === 'available') autoUpdater.downloadUpdate().catch(() => undefined)
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
