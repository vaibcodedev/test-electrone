import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns'
import { uk } from 'date-fns/locale'

export const LOCALE = uk

export function fmtDate(ts: number | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!ts) return ''
  return format(ts, pattern, { locale: uk })
}

/** «24 листопада о 19:22» (+ year when it isn't this year): no «лист.,» dot-comma clash. */
export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return ''
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear()
  return format(ts, sameYear ? "d MMMM 'о' HH:mm" : "d MMMM yyyy 'о' HH:mm", { locale: uk })
}

/** "сьогодні", "завтра", "учора" or a short date. */
export function fmtDay(ts: number | null | undefined): string {
  if (!ts) return ''
  if (isToday(ts)) return 'сьогодні'
  if (isTomorrow(ts)) return 'завтра'
  if (isYesterday(ts)) return 'учора'
  // Short date: full month (Ukrainian abbreviations end with a dot and clash with punctuation).
  return format(ts, new Date(ts).getFullYear() === new Date().getFullYear() ? 'd MMMM' : 'd MMMM yyyy', { locale: uk })
}

export function fmtRelative(ts: number | null | undefined): string {
  if (!ts) return ''
  return formatDistanceToNowStrict(ts, { locale: uk, addSuffix: true })
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m} хв`
  return m ? `${h} год ${m} хв` : `${h} год`
}

export function fmtHours(min: number): string {
  return `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)} год`
}

export function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('uk-UA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
  return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`
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

/** Value for <input type="datetime-local">. */
export function toLocalInput(ts: number | null | undefined, withTime = true): string {
  if (!ts) return ''
  return format(ts, withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd')
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Markdown → one line of plain text for previews (cards, rows). Not a parser: strips the common marks. */
export function mdPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
