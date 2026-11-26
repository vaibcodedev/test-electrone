/**
 * Repeating cards, the pure part: the rule as stored and the deadline of the next card of a series.
 * Local calendar arithmetic only (new Date(y, m, d, h, min)): a day may be 23 or 25 hours long.
 */
import { cardRepeatSchema, type CardRepeat } from '@shared/domain/boards'
import { dayKey } from '../core/util'

const lastDayOfMonth = (d: Date): number => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

/** ISO weekday of a local date: 1 = понеділок … 7 = неділя. */
export const isoWeekday = (d: Date): number => ((d.getDay() + 6) % 7) + 1

/** A stored rule, checked: anything malformed (an old or hand-edited row) counts as «doesn't repeat». */
export function parseRepeat(value: unknown): CardRepeat | null {
  if (value === null || value === undefined) return null
  const parsed = cardRepeatSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * The rule as it is saved: weekdays sorted without repeats; a monthly rule always knows its day of the month —
 * the deadline's day, else the one it had, else today's.
 */
export function normalizeRepeat(
  rule: CardRepeat | null,
  dueAt: number | null,
  now: number
): CardRepeat | null {
  if (!rule) return null
  switch (rule.freq) {
    case 'daily':
      return { freq: 'daily' }
    case 'weekly':
      return { freq: 'weekly', days: [...new Set(rule.days)].sort((a, b) => a - b) }
    case 'monthly':
      return {
        freq: 'monthly',
        day: dueAt !== null ? new Date(dueAt).getDate() : (rule.day ?? new Date(now).getDate())
      }
  }
}

/**
 * The rule an edit of the card saves (`patch` holds what the edit changed). A monthly rule keeps its day — «31-го»
 * stays 31 on a card due 28 лютого — until the deadline is moved to another day: then that day becomes the rule's.
 * Changing only the time keeps it.
 */
export function repeatAfterEdit(
  current: { repeat: CardRepeat | null; dueAt: number | null },
  patch: { repeat?: CardRepeat | null; dueAt?: number | null },
  now: number
): CardRepeat | null {
  const dueAt = patch.dueAt !== undefined ? patch.dueAt : current.dueAt
  const rule = patch.repeat !== undefined ? patch.repeat : current.repeat
  if (rule?.freq !== 'monthly') return normalizeRepeat(rule, dueAt, now)
  const newDay = patch.dueAt ?? null
  if (newDay !== null && (current.dueAt === null || dayKey(newDay) !== dayKey(current.dueAt)))
    return { freq: 'monthly', day: new Date(newDay).getDate() }
  const day = rule.day ?? (current.repeat?.freq === 'monthly' ? current.repeat.day : undefined)
  return day !== undefined ? { freq: 'monthly', day } : normalizeRepeat(rule, dueAt, now)
}

function matches(rule: CardRepeat, d: Date, monthDay: number): boolean {
  switch (rule.freq) {
    case 'daily':
      return true
    case 'weekly':
      return rule.days.includes(isoWeekday(d))
    case 'monthly':
      // «31-го» in a shorter month is its last day: 28/29 лютого, 30 квітня.
      return d.getDate() === Math.min(monthDay, lastDayOfMonth(d))
  }
}

/**
 * Deadline of the next card: the first day of the rule after both the old deadline and today — periods missed while
 * the card waited are skipped, not piled up. The time of day stays; a card without a deadline counts from today and
 * gets an all-day deadline (00:00).
 */
export function nextRepeatDue(rule: CardRepeat, dueAt: number | null, now: number): number {
  const base = new Date(dueAt !== null && dueAt > now ? dueAt : now)
  const time = dueAt !== null ? new Date(dueAt) : null
  const monthDay = rule.freq === 'monthly' ? (rule.day ?? new Date(dueAt ?? now).getDate()) : 1
  // At most a year and a bit: a weekly rule finds its day within 7, a monthly one within 31.
  for (let i = 1; i <= 400; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    if (matches(rule, d, monthDay)) {
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        time?.getHours() ?? 0,
        time?.getMinutes() ?? 0
      ).getTime()
    }
  }
  // Unreachable for a valid rule; a day later keeps the series going instead of failing the move.
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1).getTime()
}
