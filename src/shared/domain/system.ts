import { z } from 'zod'
import type { EntityType } from '../entity-types'
import { entityTypeSchema, idSchema, type EntitySummary } from './common'
import type { DueCard } from './boards'
import type { CalendarItem } from './calendar'
import type { RunningTimer } from './crm'
import type { Word } from './english'
import type { Bookmark } from './bookmarks'
import type { Idea } from './ideas'

/* ───────────── Settings ───────────── */

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const settingsSchema = z.object({
  userName: z.string().max(100),
  theme: z.enum(THEMES),
  launchAtLogin: z.boolean(),
  startHidden: z.boolean(),
  closeToTray: z.boolean(),
  quickAddShortcut: z.string().max(100),
  autoBackup: z.boolean(),
  backupKeep: z.number().int().min(1).max(100),
  autoUpdate: z.boolean(),
  /** "19:00" — evening reminder about unmarked job boards; "" = off. */
  jobReminderTime: z.string().regex(/^(\d{2}:\d{2})?$/),
  /** Weekly review notification: weekday (0 = Sunday) and time; empty time = off. */
  weeklyReviewDay: z.number().int().min(0).max(6),
  weeklyReviewTime: z.string().regex(/^(\d{2}:\d{2})?$/),
  /** Local bridge for the Chrome extension. */
  captureEnabled: z.boolean(),
  capturePort: z.number().int().min(1024).max(65535)
})
export type Settings = z.infer<typeof settingsSchema>
export const settingsPatchSchema = settingsSchema.partial()
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export interface AppInfo {
  version: string
  dataDir: string
  filesDir: string
  backupsDir: string
  platform: string
  lastBackupAt: number | null
  dbSizeBytes: number
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

export const EXPORT_FORMATS = ['json', 'markdown'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

/* ───────────── Dashboard ───────────── */

export interface DashboardData {
  today: {
    cards: DueCard[]
    overdue: DueCard[]
    agenda: CalendarItem[]
  }
  pinned: PinnedEntity[]
  favorites: PinnedEntity[]
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
