import { copyFileSync, readFileSync, renameSync, writeFileSync } from 'fs'
import {
  DEFAULT_QUICK_ADD_SHORTCUT,
  settingsSchema,
  type Settings,
  type SettingsPatch
} from '@shared/domain/system'
import {
  aiSettingsSchema,
  aiUsageSchema,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
  type AiUsage
} from '@shared/domain/ai'
import type { z } from 'zod'
import { log } from './logger'
import { retryBusy } from './util'

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
  /** Encrypted secrets (github token…) and generated keys (capture token). */
  secrets: Record<string, string>
  lastWeeklyReview: string | null
  /** Day (dayKey) the evening job-boards reminder was last shown: once a day, restarts included. */
  lastJobNudge: string | null
  /** Day (dayKey) the morning «Сьогодні дедлайн» reminder about all-day card deadlines was last shown. */
  lastCardNudge: string | null
  /** Seed sets already created once (checklist templates, platforms…): deleted seeds never come back. */
  seeded: string[]
  /** «Штучний інтелект»: provider, model, daily limit (keys live in `secrets`). */
  ai: AiSettings
  /** Today's AI requests and tokens, so the daily limit survives a restart. */
  aiUsage: AiUsage
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  theme: 'system',
  launchAtLogin: false,
  startHidden: true,
  closeToTray: true,
  quickAddShortcut: DEFAULT_QUICK_ADD_SHORTCUT,
  autoBackup: true,
  backupKeep: 14,
  autoUpdate: true,
  jobReminderTime: '19:00',
  weeklyReviewDay: 0,
  weeklyReviewTime: '18:00',
  captureEnabled: true,
  capturePort: 47219,
  hiddenNavHubs: [],
  hiddenNavItems: []
}

const DEFAULTS: ConfigShape = {
  settings: DEFAULT_SETTINGS,
  window: { width: 1360, height: 860, maximized: false },
  lastBackupAt: null,
  secrets: {},
  lastWeeklyReview: null,
  lastJobNudge: null,
  lastCardNudge: null,
  seeded: [],
  ai: DEFAULT_AI_SETTINGS,
  aiUsage: { day: '', requests: 0, inputTokens: 0, outputTokens: 0 }
}

/**
 * A section key by key: one bad value (hand edit, an older version, a narrowed schema) resets only itself,
 * not the hotkey, autostart and backups along with it. A key the file doesn't have yet (a section added by
 * a newer version) takes its default.
 */
function readSection<S extends z.ZodObject>(
  name: string,
  schema: S,
  defaults: z.infer<S>,
  raw: unknown
): z.infer<S> {
  const stored = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const section: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    const value = stored[key]
    const parsed = value === undefined ? undefined : (field as z.ZodType).safeParse(value)
    if (parsed && !parsed.success)
      log.warn(`[config] invalid ${name} «${key}» reset to the default`)
    section[key] = parsed?.success ? parsed.data : defaults[key as keyof z.infer<S>]
  }
  return schema.parse(section)
}

const readSettings = (raw: unknown): Settings =>
  readSection('setting', settingsSchema, DEFAULT_SETTINGS, raw)

type Listener = (settings: Settings) => void

/**
 * Small JSON store for machine-level config (window bounds, preferences).
 * Kept outside the database on purpose: restoring a backup must not move your window or change hotkeys.
 */
export class ConfigStore {
  private data: ConfigShape
  private listeners = new Set<Listener>()
  private writeTimer: NodeJS.Timeout | null = null
  /**
   * The file exists but could not be read (locked by an antivirus, no access): never write over it,
   * or the encrypted keys and the seed ledger in it would be lost. Changes live until the app closes.
   */
  private readOnly = false

  constructor(private readonly file: string) {
    this.data = this.read()
  }

  private read(): ConfigShape {
    let text: string
    try {
      text = retryBusy(() => readFileSync(this.file, 'utf8'), 2)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.readOnly = true
        log.error(`[config] ${this.file} cannot be read, starting from defaults without saving`, e)
      }
      return structuredClone(DEFAULTS)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      this.keepBroken(e)
      return structuredClone(DEFAULTS)
    }
    // Valid JSON that is not an object (`null`, an array, a number) is as broken as a syntax error.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.keepBroken(new Error('config is not an object'))
      return structuredClone(DEFAULTS)
    }
    const raw = parsed as Partial<ConfigShape>
    return {
      settings: readSettings(raw.settings),
      window: { ...DEFAULTS.window, ...raw.window },
      lastBackupAt: typeof raw.lastBackupAt === 'number' ? raw.lastBackupAt : null,
      secrets: raw.secrets && typeof raw.secrets === 'object' ? raw.secrets : {},
      lastWeeklyReview: typeof raw.lastWeeklyReview === 'string' ? raw.lastWeeklyReview : null,
      lastJobNudge: typeof raw.lastJobNudge === 'string' ? raw.lastJobNudge : null,
      lastCardNudge: typeof raw.lastCardNudge === 'string' ? raw.lastCardNudge : null,
      seeded: Array.isArray(raw.seeded)
        ? raw.seeded.filter((x): x is string => typeof x === 'string')
        : [],
      ai: readSection('AI setting', aiSettingsSchema, DEFAULT_AI_SETTINGS, raw.ai),
      aiUsage: aiUsageSchema.safeParse(raw.aiUsage).data ?? structuredClone(DEFAULTS.aiUsage)
    }
  }

  /** A broken file holds the encrypted keys and the seed ledger: keep a copy before the next write replaces it. */
  private keepBroken(e: unknown): void {
    const copy = `${this.file}.broken-${Date.now()}`
    try {
      copyFileSync(this.file, copy)
    } catch {
      /* unreadable as well: nothing to keep */
    }
    log.error(`[config] ${this.file} is unreadable, starting from defaults (copy: ${copy})`, e)
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), 300)
  }

  flush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = null
    if (this.readOnly) return
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

  secret(key: string): string | null {
    return this.data.secrets[key] ?? null
  }

  setSecret(key: string, value: string | null): void {
    if (value) this.data.secrets[key] = value
    else delete this.data.secrets[key]
    this.scheduleWrite()
  }

  get lastWeeklyReview(): string | null {
    return this.data.lastWeeklyReview
  }

  set lastWeeklyReview(week: string | null) {
    this.data.lastWeeklyReview = week
    this.scheduleWrite()
  }

  get lastJobNudge(): string | null {
    return this.data.lastJobNudge
  }

  set lastJobNudge(day: string | null) {
    this.data.lastJobNudge = day
    this.scheduleWrite()
  }

  get lastCardNudge(): string | null {
    return this.data.lastCardNudge
  }

  set lastCardNudge(day: string | null) {
    this.data.lastCardNudge = day
    this.scheduleWrite()
  }

  get aiSettings(): AiSettings {
    return structuredClone(this.data.ai)
  }

  /** Takes the whole validated section (AiService merges and checks patches). */
  updateAiSettings(next: AiSettings): void {
    this.data.ai = aiSettingsSchema.parse(next)
    this.scheduleWrite()
  }

  get aiUsage(): AiUsage {
    return { ...this.data.aiUsage }
  }

  set aiUsage(usage: AiUsage) {
    this.data.aiUsage = usage
    this.scheduleWrite()
  }

  isSeeded(key: string): boolean {
    return this.data.seeded.includes(key)
  }

  markSeeded(key: string): void {
    if (this.isSeeded(key)) return
    this.data.seeded.push(key)
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

/** Remembers which seed sets were created (ConfigStore implements it). */
export type SeedLedger = Pick<ConfigStore, 'isSeeded' | 'markSeeded'>

/**
 * Seeds a set once per installation. A non-empty table counts as seeded (databases from before the
 * ledger), so templates the user deleted aren't re-created on a later start once the trash is emptied.
 */
export function seedOnce(
  ledger: SeedLedger,
  key: string,
  hasRows: () => boolean,
  seed: () => void
): void {
  if (ledger.isSeeded(key)) return
  if (!hasRows()) seed()
  ledger.markSeeded(key)
}
