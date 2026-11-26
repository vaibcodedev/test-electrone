import { z } from 'zod'
import type { EntityType } from '../entity-types'
import { entityTypeSchema, idSchema, patchOf, type EntitySummary } from './common'
import type { DueCard } from './boards'
import type { CalendarItem } from './calendar'
import type { RunningTimer } from './crm'
import { ENGLISH_ACCENTS, ENGLISH_NEW_PER_DAY, ENGLISH_REVIEWS_PER_DAY, type Word } from './english'
import type { Bookmark } from './bookmarks'
import type { Idea } from './ideas'

/* ───────────── Settings ───────────── */

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

/** Global «Швидке додавання» shortcut of a fresh install (main defaults, renderer «Скинути»). */
export const DEFAULT_QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+Space'

/** Sidebar groups (renderer HUBS ids). Shared so main can refuse hiding all of them. */
export const NAV_HUB_IDS = [
  'work',
  'freelance',
  'jobs',
  'finance',
  'dev',
  'knowledge',
  'inspiration'
] as const
export type NavHubId = (typeof NAV_HUB_IDS)[number]

/** True when the list hides every sidebar group: main refuses such a patch, one group always stays. */
export function hidesEveryHub(hidden: readonly string[]): boolean {
  return NAV_HUB_IDS.every((id) => hidden.includes(id))
}

/** «Як до вас звертатися»: a name for the greeting, not free text. */
export const USER_NAME_MAX = 40

/** Shown under the field when it refused a character. */
export const USER_NAME_RULE = 'Лише літери й цифри, між ними — один знак'

/**
 * A name as it may be typed, permissive on purpose (names of any script, «Анна-Марія», «Мар’яна», «J. R.»):
 * letters, digits and single separators between them; it starts with a letter or a digit, and the only two
 * separators in a row are «. » of initials. A separator at the very end stays: the next letter may follow.
 */
export function tidyName(text: string): string {
  return text
    .replace(/[^\p{L}\p{M}\p{N} .'’ʼ-]/gu, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[ .'’ʼ-]{2,}/g, (run) => (run.startsWith('. ') ? '. ' : run[0]))
}

/** The name as it is saved: without a separator left hanging at the end (a final dot stays: «Коля П.»). */
export const finishName = (text: string): string => tidyName(text).replace(/[ '’ʼ-]+$/, '')

export const settingsSchema = z.object({
  // Wider than USER_NAME_MAX on purpose: a name stored before the limit was lowered must not be reset on read.
  userName: z.string().max(100),
  theme: z.enum(THEMES),
  launchAtLogin: z.boolean(),
  startHidden: z.boolean(),
  closeToTray: z.boolean(),
  quickAddShortcut: z.string().max(100),
  autoBackup: z.boolean(),
  backupKeep: z.number().int().min(1).max(100),
  /** Copies of this computer kept in «Папка для копій» (the folder itself is chosen in main, never patched). */
  backupFolderKeep: z.number().int().min(1).max(50),
  autoUpdate: z.boolean(),
  /** "19:00" — evening reminder about unmarked job boards; "" = off. */
  jobReminderTime: z.string().regex(/^(\d{2}:\d{2})?$/),
  /** Weekly review notification: weekday (0 = Sunday) and time; empty time = off. */
  weeklyReviewDay: z.number().int().min(0).max(6),
  weeklyReviewTime: z.string().regex(/^(\d{2}:\d{2})?$/),
  /** Local bridge for the Chrome extension. */
  captureEnabled: z.boolean(),
  capturePort: z.number().int().min(1024).max(65535),
  /**
   * Sidebar groups switched off in «Налаштування → Меню». Only hidden ones are stored, so a new group starts
   * visible. Plain strings, not an enum: a group removed later must not reset the whole list on read.
   */
  hiddenNavHubs: z.array(z.string().max(40)).max(50),
  /** Nav item paths switched off («/jobs/stats», «/review»). Unknown paths are ignored. */
  hiddenNavItems: z.array(z.string().max(200)).max(200),
  /** «Англійська → Налаштування тренування»: the daily goal, the voice and autoplay of pronunciation. */
  englishNewPerDay: z.number().int().min(ENGLISH_NEW_PER_DAY.min).max(ENGLISH_NEW_PER_DAY.max),
  englishReviewsPerDay: z
    .number()
    .int()
    .min(ENGLISH_REVIEWS_PER_DAY.min)
    .max(ENGLISH_REVIEWS_PER_DAY.max),
  englishAccent: z.enum(ENGLISH_ACCENTS),
  englishAutoplay: z.boolean()
})
export type Settings = z.infer<typeof settingsSchema>
export const settingsPatchSchema = patchOf(settingsSchema).extend({
  userName: z
    .string()
    .max(USER_NAME_MAX)
    .refine((name) => name === finishName(name), USER_NAME_RULE)
    .optional()
})
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export interface AppInfo {
  version: string
  dataDir: string
  filesDir: string
  backupsDir: string
  platform: string
  lastBackupAt: number | null
  dbSizeBytes: number
  logFile: string
}

/* ───────────── Tags / links / pins ───────────── */

export const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null)
})
export type TagInput = z.input<typeof tagInputSchema>

export interface LinkedEntity extends EntitySummary {
  linkId: string
  direction: 'out' | 'in'
}

export const linkInputSchema = z.object({
  fromType: entityTypeSchema,
  fromId: idSchema,
  toType: entityTypeSchema,
  toId: idSchema
})
export type LinkInput = z.infer<typeof linkInputSchema>

export const PIN_KINDS = ['pin', 'favorite'] as const
export type PinKind = (typeof PIN_KINDS)[number]

export interface PinnedEntity extends EntitySummary {
  kind: PinKind
  position: number
}

/* ───────────── Search ───────────── */

export const searchQuerySchema = z.object({
  text: z.string().max(300),
  types: z.array(entityTypeSchema).optional(),
  limit: z.number().int().min(1).max(200).optional()
})
export type SearchQuery = z.infer<typeof searchQuerySchema>

/** `search.recent`: a bare number (palette, links) or `{ limit, types }` — the type filter runs in SQL. */
export const recentQuerySchema = z
  .union([
    z.number().int().min(1).max(50),
    z.object({
      limit: z.number().int().min(1).max(50).optional(),
      types: z.array(entityTypeSchema).max(50).optional()
    })
  ])
  .optional()
export type RecentQuery = z.infer<typeof recentQuerySchema>

export interface SearchHit extends EntitySummary {
  /** Snippet with matches wrapped in \u0001…\u0002 markers. */
  snippet: string
  rank: number
}

/* ───────────── Trash ───────────── */

export interface TrashItem extends EntitySummary {
  deletedAt: number
  /** Timestamp when it will be purged automatically. */
  purgeAt: number
}

/* ───────────── Files ───────────── */

export interface Attachment {
  id: string
  entityType: EntityType
  entityId: string
  /** Path relative to the files folder; served via vault-file:// protocol. */
  path: string
  originalName: string
  mime: string
  size: number
  createdAt: number
}

/* ───────────── Backup / export ───────────── */

export interface BackupEntry {
  fileName: string
  path: string
  size: number
  createdAt: number
}

/** «Бекап → Папка для копій»: a second copy of every daily backup on another disk or in a synced cloud folder. */
export interface BackupFolderInfo {
  /** null — backups live only in Vault's own folder (the default). */
  path: string | null
  /** The newest copy that reached the folder and passed the check. */
  lastOkAt: number | null
  /** The last attempt failed (folder unplugged, cloud client not running…): when and why, for the person. */
  lastError: { at: number; message: string } | null
  /** false in «Тестовий режим»: test data is never copied to an outside folder. */
  enabled: boolean
}

export const EXPORT_FORMATS = ['json', 'markdown'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

/* ───────────── Storage (Налаштування → Сховище) ───────────── */

/** Folders «Сховище» opens. The log folder has its own button: settings.openLogs. */
export const STORAGE_FOLDERS = ['data', 'files', 'backups', 'app'] as const
export type StorageFolder = (typeof STORAGE_FOLDERS)[number]
export const storageFolderSchema = z.object({ folder: z.enum(STORAGE_FOLDERS) })

/** Disk use by category. No byte is counted twice: `total` is the sum of the rows shown. */
export interface StorageUsage {
  computedAt: number
  /** vault.db + -wal + -shm */
  database: { bytes: number }
  files: { bytes: number; count: number }
  /** `prunable` — what «Видалити старі» removes (never pre-update copies or unknown files). */
  backups: { bytes: number; count: number; prunable: { count: number; bytes: number } }
  /** `removableBytes` — rotated logs only; the current log is counted in `other`. */
  logs: { bytes: number; removableBytes: number }
  /** Only the folders «Очистити кеш» empties. */
  cache: { bytes: number }
  other: { bytes: number }
  /** The installed program; null when not packaged (dev, tests). */
  app: { bytes: number; installDir: string } | null
  total: number
  diskFree: number | null
}

export interface StorageFreed {
  freedBytes: number
  removed: number
}

/* ───────────── Dashboard ───────────── */

export interface DashboardData {
  today: {
    cards: DueCard[]
    overdue: DueCard[]
    agenda: CalendarItem[]
  }
  pinned: PinnedEntity[]
  recent: EntitySummary[]
  inboxIdeas: Idea[]
  reading: Bookmark[]
  english: { due: number; total: number; wordOfDay: Word | null }
  timer: RunningTimer | null
  weekMinutes: number
  counts: Partial<Record<EntityType, number>>
  /** Items completed per day for the last 14 days (cards + checklist runs). */
  activity: { day: string; count: number }[]
}

/* ───────────── Updates ───────────── */

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
  | { state: 'disabled'; reason: string }

/* ───────────── Quick add ───────────── */

export const QUICK_ADD_TARGETS = [
  'idea',
  'card',
  'claude',
  'snippet',
  'bookmark',
  'word',
  'event'
] as const
export type QuickAddTarget = (typeof QUICK_ADD_TARGETS)[number]

export const quickAddSchema = z.object({
  target: z.enum(QUICK_ADD_TARGETS),
  text: z.string().trim().min(1).max(5000),
  /** Optional second line: description / translation / url. */
  extra: z.string().max(5000).default('')
})
export type QuickAddInput = z.input<typeof quickAddSchema>
