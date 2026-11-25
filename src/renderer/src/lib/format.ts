import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday
} from 'date-fns'
import { uk } from 'date-fns/locale'
import { fmtDateTime as dateTime, fmtDayFull as dayFull } from '@shared/dates'
import { hostOf as urlHost } from '@shared/url'

export const LOCALE = uk

/** Without a pattern — `fmtDayFull`; an explicit date-fns pattern is applied as is. */
export function fmtDate(ts: number | null | undefined, pattern?: string): string {
  if (!ts) return ''
  return pattern ? format(ts, pattern, { locale: uk }) : fmtDayFull(ts)
}

/** «24 листопада» (+ year when it isn't this year): a plain date, without «сьогодні/завтра». */
export function fmtDayFull(ts: number | null | undefined): string {
  if (!ts) return ''
  return dayFull(ts)
}

/** «24 листопада о 19:22» (+ year when it isn't this year): no «лист.,» dot-comma clash. */
export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return ''
  return dateTime(ts)
}

/** A week: «23–29 листопада», «30 листопада – 6 грудня»; `year` adds the year to the end date. */
export function fmtWeekRange(from: Date, to: Date, opts: { year?: boolean } = {}): string {
  const end = format(to, opts.year ? 'd MMMM yyyy' : 'd MMMM', { locale: uk })
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
  return sameMonth
    ? `${from.getDate()}–${end}`
    : `${format(from, 'd MMMM', { locale: uk })} – ${end}`
}

/** "сьогодні", "завтра", "учора" or a short date. */
export function fmtDay(ts: number | null | undefined): string {
  if (!ts) return ''
  if (isToday(ts)) return 'сьогодні'
  if (isTomorrow(ts)) return 'завтра'
  if (isYesterday(ts)) return 'учора'
  // Short date: full month (Ukrainian abbreviations end with a dot and clash with punctuation).
  return fmtDayFull(ts)
}

/** «завтра о 15:00», «24 листопада о 19:22»: a day with a set time (deadline, interview, event). */
export function fmtDayTime(ts: number | null | undefined): string {
  if (!ts) return ''
  return `${fmtDay(ts)} о ${format(ts, 'HH:mm', { locale: uk })}`
}

/**
 * A narrow date block (agenda, EventDate): «сьогодні»/«завтра», the next days of the week by name
 * («п’ятниця» fits 64px, «27 листопада» wraps), then fmtDay. Past days keep the date: «вівторок» back
 * then would read as the coming one.
 */
export function fmtDayNear(ts: number | null | undefined): string {
  if (!ts) return ''
  const days = differenceInCalendarDays(ts, new Date())
  return days >= 2 && days <= 6 ? format(ts, 'EEEE', { locale: uk }) : fmtDay(ts)
}

/** Chart axes and dense tables: «5 листоп.» (+ year when it isn't this year). Not for text: the dot clashes with punctuation. */
export function fmtDayShort(ts: number | Date): string {
  return format(ts, isThisYear(ts) ? 'd MMM' : 'd MMM yyyy', { locale: uk })
}

/**
 * A record title quoted in a toast or a confirmation: up to 80 characters, then «…». A 500-character title
 * took nine lines and pushed the point of the message («без можливості відновлення») out of sight.
 */
export function fmtTitle(title: string): string {
  return title.length > 80 ? `${title.slice(0, 79)}…` : title
}

export function fmtRelative(ts: number | null | undefined): string {
  if (!ts) return ''
  // Counting seconds is noise, and «0 секунд тому» reads like an error.
  if (Math.abs(Date.now() - ts) < 60_000) return 'щойно'
  return formatDistanceToNowStrict(ts, { locale: uk, addSuffix: true })
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m} хв`
  return m ? `${h} год ${m} хв` : `${h} год`
}

/** A plain number in the uk locale: «9 000 000», «4,9» (up to two decimals). */
export function fmtNumber(n: number): string {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 2 })
}

/** One decimal at most, with a comma: «1,5». */
const oneDecimal = (n: number): string => n.toLocaleString('uk-UA', { maximumFractionDigits: 1 })

export function fmtHours(min: number): string {
  // Under an hour «0 год» read as «no time tracked»: minutes instead.
  if (min < 60) return fmtMinutes(min)
  return `${oneDecimal(min / 60)} год`
}

export function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
  }
}

/** Amounts from 100 000 up are shortened for stat tiles: «250 тис. USD», «55 млн USD», «5,9 млн EUR». */
export const COMPACT_FROM = 100_000

export function fmtMoneyCompact(amount: number, currency: string): string {
  if (Math.abs(amount) < COMPACT_FROM) return fmtMoney(amount, currency)
  try {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(amount)
  } catch {
    return fmtMoney(amount, currency)
  }
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 ** 2) return `${oneDecimal(bytes / 1024)} КБ`
  if (bytes < 1024 ** 3) return `${oneDecimal(bytes / 1024 ** 2)} МБ`
  return `${oneDecimal(bytes / 1024 ** 3)} ГБ`
}

/** Ukrainian (and Russian) 3-form plural: plural(5, ['ідея', 'ідеї', 'ідей']). */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

/**
 * Local calendar day as «2026-01-05»: the key for grouping by day. Zero-padded, so keys sort as text
 * and parse back as local midnight with `new Date(key + 'T00:00')`.
 */
export function dayKey(ts: number | Date): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** «github.com» from «https://www.github.com/x»; anything that isn't a URL comes back as is. */
export const hostOf = (url: string): string => urlHost(url) ?? url

/** Markdown → one line of plain text for previews (cards, rows). Not a parser: strips the common marks. */
export function mdPreview(md: string): string {
  return (
    md
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      // Paired markers only: «process_env» and «2 * 3» keep their characters.
      .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
      .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
      .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?![\w])/g, '$1$2')
      .replace(/`([^`\n]*)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Header count for paged lists: exact once everything is loaded, «100+ …» while more pages remain. */
export function countLabel(n: number, hasMore: boolean, forms: [string, string, string]): string {
  return hasMore ? `${n}+ ${forms[2]}` : `${n} ${plural(n, forms)}`
}

/** «за 3 години», «за 2 дні», «менш ніж за годину» — average client reply time. */
export function fmtReplyTime(hours: number): string {
  if (hours < 1) return 'менш ніж за годину'
  if (hours < 48) {
    const h = Math.round(hours)
    return `за ${h} ${plural(h, ['годину', 'години', 'годин'])}`
  }
  const d = Math.round(hours / 24)
  return `за ${d} ${plural(d, ['день', 'дні', 'днів'])}`
}

/** Percent in the uk locale: 33,3 %. */
export function fmtPercent(value: number): string {
  return `${value.toLocaleString('uk-UA', { maximumFractionDigits: 1 })}%`
}

/** «листопад 2026» → «Листопад 2026». */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Whole days since a moment (null when there is none). */
export function daysSince(ts: number | null, now: number): number | null {
  if (!ts) return null
  return Math.max(0, Math.floor((now - ts) / 86_400_000))
}

/** Spaced repetition ease factor in words (english words, interview questions). */
export function easeLabel(ease: number): string {
  if (ease >= 2.45) return 'легко'
  if (ease >= 2.0) return 'середньо'
  return 'важко'
}
