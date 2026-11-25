import { format, isToday, isTomorrow } from 'date-fns'
import { uk } from 'date-fns/locale'

/**
 * Dates as the UI writes them — the single source of the date formats: main (search, links, pins
 * subtitles) uses them directly, renderer lib/format wraps them.
 */
const sameYear = (ts: number): boolean => new Date(ts).getFullYear() === new Date().getFullYear()

/** «24 листопада» (+ year when it isn't this year). */
export function fmtDayFull(ts: number): string {
  return format(ts, sameYear(ts) ? 'd MMMM' : 'd MMMM yyyy', { locale: uk })
}

/** «24 листопада о 19:22» (+ year when it isn't this year). */
export function fmtDateTime(ts: number): string {
  return format(ts, sameYear(ts) ? "d MMMM 'о' HH:mm" : "d MMMM yyyy 'о' HH:mm", { locale: uk })
}

/**
 * When an event starts, for a notification: «Сьогодні о 15:00», «Завтра», «26 листопада о 15:00».
 * All-day events get the day only.
 */
export function fmtWhen(ts: number, allDay: boolean): string {
  const day = isToday(ts) ? 'Сьогодні' : isTomorrow(ts) ? 'Завтра' : null
  if (allDay) return day ?? fmtDayFull(ts)
  return day ? `${day} ${format(ts, "'о' HH:mm")}` : fmtDateTime(ts)
}
