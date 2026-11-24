import { randomUUID } from 'crypto'

export const newId = (): string => randomUUID()
export const now = (): number => Date.now()

export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  return startOfDay(ts) + DAY_MS - 1
}

export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts))
  const day = (d.getDay() + 6) % 7 // Monday = 0
  return d.getTime() - day * DAY_MS
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
