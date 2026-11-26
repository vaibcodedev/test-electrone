/**
 * iCalendar (RFC 5545) writer, pure: no database, no Electron. Lines end in CRLF and are folded at 75 octets
 * without cutting a UTF-8 character; text is escaped. Times are floating local time (no TZID, no «Z»), so a
 * recurring event keeps its wall-clock time across daylight saving, as Vault shows it; all-day events are dates
 * with an exclusive end.
 */
import type { Recurrence } from '@shared/domain/calendar'

export interface IcsEvent {
  /** Stable across exports: a calendar that imports the file again updates the event instead of adding a copy. */
  uid: string
  title: string
  description?: string
  /** Category shown by some calendars (the Vault source: «Дедлайн картки», «Оплата»…). */
  category?: string
  start: number
  /** All-day: the last day (any time on it, inclusive). Timed: the end moment. null — no end. */
  end: number | null
  allDay: boolean
  /** RRULE value without the «RRULE:» prefix. */
  rrule?: string | null
  /** Reminders, minutes before the start. */
  alarms?: number[]
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** YYYYMMDD of the local day. */
export function icsDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/** Floating local date-time: YYYYMMDDTHHMMSS. */
export function icsLocal(ts: number): string {
  const d = new Date(ts)
  return `${icsDate(ts)}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** UTC date-time for DTSTAMP: YYYYMMDDTHHMMSSZ. */
export function icsUtc(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

/** TEXT value escaping (RFC 5545 §3.3.11): backslash, semicolon, comma and line breaks. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

const utf8Length = (ch: string): number => {
  const cp = ch.codePointAt(0) ?? 0
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
}

/**
 * Folds a content line (RFC 5545 §3.1): no physical line longer than 75 octets, continuation lines start with a
 * space (which counts), and a character is never split between two lines. Returns the lines joined by CRLF.
 */
export function foldLine(line: string): string {
  const out: string[] = []
  let current = ''
  let octets = 0
  // for…of walks code points: a surrogate pair (emoji) stays whole.
  for (const ch of line) {
    const len = utf8Length(ch)
    if (octets + len > 75) {
      out.push(current)
      current = ' '
      octets = 1
    }
    current += ch
    octets += len
  }
  out.push(current)
  return out.join('\r\n')
}

/**
 * RRULE that gives the same days as Vault's own recurrence (modules/calendar.ts): a monthly event on the 29th–31st
 * falls on the month's last day when the month is shorter, the yearly 29 лютого on 28 лютого outside leap years.
 * Plain BYMONTHDAY=31 would skip those months instead.
 */
export function rruleFor(recurrence: Recurrence, start: number): string | null {
  const d = new Date(start)
  const day = d.getDate()
  switch (recurrence) {
    case 'daily':
      return 'FREQ=DAILY'
    case 'weekly':
      return 'FREQ=WEEKLY'
    case 'monthly':
      if (day <= 28) return 'FREQ=MONTHLY'
      if (day === 31) return 'FREQ=MONTHLY;BYMONTHDAY=-1'
      // The last of {28…day} that the month has: 30 → 30 or 28/29 in лютий.
      return `FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`
    case 'yearly':
      return d.getMonth() === 1 && day === 29
        ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1'
        : 'FREQ=YEARLY'
    default:
      return null
  }
}

/** A duration before the start (TRIGGER): -PT15M, -PT1H, -P1D; the start itself is PT0S. */
export function triggerFor(minutes: number): string {
  if (minutes <= 0) return 'PT0S'
  if (minutes % 1440 === 0) return `-P${minutes / 1440}D`
  if (minutes % 60 === 0) return `-PT${minutes / 60}H`
  return `-PT${minutes}M`
}

/** The day after a local day (DST-safe). */
const nextDay = (ts: number): number => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

function eventLines(e: IcsEvent, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${escapeText(e.uid)}`, `DTSTAMP:${stamp}`]
  if (e.allDay) {
    const last = e.end !== null && e.end > e.start ? e.end : e.start
    lines.push(
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(last))}`
    )
  } else {
    lines.push(`DTSTART:${icsLocal(e.start)}`)
    if (e.end !== null && e.end > e.start) lines.push(`DTEND:${icsLocal(e.end)}`)
  }
  if (e.rrule) lines.push(`RRULE:${e.rrule}`)
  lines.push(`SUMMARY:${escapeText(e.title)}`)
  if (e.description?.trim()) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
  if (e.category) lines.push(`CATEGORIES:${escapeText(e.category)}`)
  for (const minutes of [...new Set(e.alarms ?? [])]) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(e.title)}`,
      `TRIGGER:${triggerFor(minutes)}`,
      'END:VALARM'
    )
  }
  lines.push('END:VEVENT')
  return lines
}

/** The whole file: VCALENDAR with one VEVENT per event, CRLF line ends, folded lines. */
export function buildIcs(events: IcsEvent[], opts: { now: number; name: string }): string {
  const stamp = icsUtc(opts.now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vault//Calendar export//UK',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    ...events.flatMap((e) => eventLines(e, stamp)),
    'END:VCALENDAR'
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
