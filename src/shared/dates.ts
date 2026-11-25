import { format } from 'date-fns'
import { uk } from 'date-fns/locale'

/** Dates as the UI writes them, for text made in main (search, links, pins subtitles); mirrors renderer lib/format. */
const sameYear = (ts: number): boolean => new Date(ts).getFullYear() === new Date().getFullYear()

/** «24 листопада» (+ year when it isn't this year). */
export function fmtDayFull(ts: number): string {
  return format(ts, sameYear(ts) ? 'd MMMM' : 'd MMMM yyyy', { locale: uk })
}

/** «24 листопада о 19:22» (+ year when it isn't this year). */
export function fmtDateTime(ts: number): string {
  return format(ts, sameYear(ts) ? "d MMMM 'о' HH:mm" : "d MMMM yyyy 'о' HH:mm", { locale: uk })
}
