import { randomUUID } from 'crypto'

export const newId = (): string => randomUUID()
export const now = (): number => Date.now()

/**
 * Nominal day length. Fine for durations ("3 days ago", TTLs), but NOT for stepping between calendar
 * days — a DST day is 23 or 25 hours long. Use `addDays` / `startOfDay` for calendar arithmetic.
 */
export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Same local wall-clock time `n` calendar days later (DST-safe: a day may be 23 or 25 hours). */
export function addDays(ts: number, n: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  return addDays(startOfDay(ts), 1) - 1
}

export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts))
  const day = (d.getDay() + 6) % 7 // Monday = 0
  return addDays(d.getTime(), -day)
}

/** Local calendar date `YYYY-MM-DD` (not UTC: `toISOString()` gives the previous day east of Greenwich). */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole local calendar days since 1970-01-01 — changes exactly at local midnight. */
export function localDayNumber(ts: number): number {
  const d = new Date(ts)
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

export function startOfMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

/** Removes undefined keys so drizzle `.set()` only touches provided fields. */
export function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND'
  constructor(what: string, id: string) {
    super(`${what}: не знайдено (${id})`)
  }
}

export class UserError extends Error {
  readonly code = 'USER'
}

/** Builds a safe FTS5 MATCH expression from free text: every token becomes a quoted prefix term. */
export function toFtsQuery(text: string): string | null {
  const tokens = text
    .normalize('NFKC')
    .split(/[\s\p{P}\p{S}]+/u)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12)
  if (!tokens.length) return null
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ')
}

/** Escapes LIKE wildcards. Use with `ESCAPE '\\'`. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (m) => '\\' + m)}%`
}

export function slugify(text: string, fallback = 'item'): string {
  const s = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || fallback
}

/** Plain-text excerpt of markdown for subtitles (drops syntax, collapses whitespace). */
export function excerpt(md: string, max = 80): string | undefined {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

/**
 * Minutes of a time entry that fall inside [from, to]. An entry crossing midnight or a week boundary
 * counts in each period only for its own part; a manual entry whose minutes differ from its clock span
 * is scaled proportionally. Running entries (endedAt null) count up to `at`.
 */
export function overlapMinutes(
  e: { startedAt: number; endedAt: number | null; minutes: number },
  from: number,
  to: number,
  at: number
): number {
  const end = e.endedAt ?? at
  const span = end - e.startedAt
  const minutes = e.endedAt ? e.minutes : Math.max(0, Math.round(span / 60_000))
  if (span <= 0) return e.startedAt >= from && e.startedAt <= to ? minutes : 0
  const overlap = Math.min(end, to) - Math.max(e.startedAt, from)
  if (overlap <= 0) return 0
  return Math.round((minutes * overlap) / span)
}
