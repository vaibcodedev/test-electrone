import { readFileSync, renameSync, writeFileSync } from 'fs'
import { settingsSchema, type Settings, type SettingsPatch } from '@shared/domain/system'

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

interface ConfigShape {
  settings: Settings
  window: WindowState
  lastBackupAt: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  theme: 'system',
  launchAtLogin: false,
  startHidden: true,
  closeToTray: true,
  quickAddShortcut: 'CommandOrControl+Shift+Space',
  autoBackup: true,
  backupKeep: 14,
  autoUpdate: true,
  jobReminderTime: '19:00'
}

const DEFAULTS: ConfigShape = {
  settings: DEFAULT_SETTINGS,
  window: { width: 1360, height: 860, maximized: false },
  lastBackupAt: null
}

type Listener = (settings: Settings) => void

/**
 * Small JSON store for machine-level config (window bounds, preferences).
 * Kept outside the database on purpose: restoring a backup must not move your window or change hotkeys.
 */
export class ConfigStore {
  private data: ConfigShape
  private listeners = new Set<Listener>()
  private writeTimer: NodeJS.Timeout | null = null

  constructor(private readonly file: string) {
    this.data = this.read()
  }

  private read(): ConfigShape {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<ConfigShape>
      const settings = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...raw.settings })
      return {
        settings: settings.success ? settings.data : DEFAULT_SETTINGS,
        window: { ...DEFAULTS.window, ...raw.window },
        lastBackupAt: typeof raw.lastBackupAt === 'number' ? raw.lastBackupAt : null
      }
    } catch {
      return structuredClone(DEFAULTS)
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), 300)
  }

  flush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = null
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }

  get settings(): Settings {
    return { ...this.data.settings }
  }

  updateSettings(patch: SettingsPatch): Settings {
    this.data.settings = settingsSchema.parse({ ...this.data.settings, ...patch })
    this.scheduleWrite()
    for (const l of this.listeners) l(this.settings)
    return this.settings
  }

  onSettingsChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get windowState(): WindowState {
    return { ...this.data.window }
  }

  set windowState(state: WindowState) {
    this.data.window = state
    this.scheduleWrite()
  }

  get lastBackupAt(): number | null {
    return this.data.lastBackupAt
  }

  set lastBackupAt(ts: number | null) {
    this.data.lastBackupAt = ts
    this.scheduleWrite()
  }
}
