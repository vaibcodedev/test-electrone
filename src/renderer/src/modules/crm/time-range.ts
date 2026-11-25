/** Pure helpers of the manual time-entry form (unit-tested in tests/unit/time-range.test.ts). */
import { format } from 'date-fns'
import { timeEntryInputSchema, type TimeEntry } from '@shared/domain/crm'
import { limitsOf } from '@/lib/limits'

export const DESC_MAX = limitsOf(timeEntryInputSchema).description

export interface EntryDraft {
  day: number
  from: string
  to: string
  minutes: string
  description: string
  billable: boolean
}

export const startOfDayMs = (ts: number): number => new Date(ts).setHours(0, 0, 0, 0)

export function emptyDraft(): EntryDraft {
  return {
    day: startOfDayMs(Date.now()),
    from: '',
    to: '',
    minutes: '',
    description: '',
    billable: true
  }
}

export function draftOf(e: TimeEntry): EntryDraft {
  return {
    day: startOfDayMs(e.startedAt),
    from: format(e.startedAt, 'HH:mm'),
    to: e.endedAt ? format(e.endedAt, 'HH:mm') : '',
    minutes: '',
    description: e.description,
    billable: e.billable
  }
}

/** Local wall-clock `HH:mm` on the given day (`dayOffset` days later — DST-safe calendar step). */
export function combine(day: number, time: string, dayOffset = 0): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const d = new Date(day)
  if (dayOffset) d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m || 0, 0, 0)
  return d.getTime()
}

/**
 * Converts a draft to start/end: either explicit from–to, or "minutes" ending now (or at 18:00 of a
 * past day). «23:00–01:00» is a night shift: an end earlier than the start is on the next day.
 */
export function toRange(d: EntryDraft, nowMs = Date.now()): { startedAt: number; endedAt: number } | null {
  const from = combine(d.day, d.from)
  const to = combine(d.day, d.to)
  if (from !== null && to !== null) {
    if (to > from) return { startedAt: from, endedAt: to }
    if (to === from) return null
    return { startedAt: from, endedAt: combine(d.day, d.to, 1)! }
  }
  const minutes = Number(d.minutes.replace(',', '.'))
  if (!minutes || minutes <= 0) return null
  const today = startOfDayMs(nowMs) === startOfDayMs(d.day)
  const end = from !== null ? from + minutes * 60_000 : today ? nowMs : combine(d.day, '18:00')!
  return { startedAt: from ?? end - minutes * 60_000, endedAt: end }
}
