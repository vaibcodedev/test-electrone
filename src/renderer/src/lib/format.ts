import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns'
import { ru } from 'date-fns/locale'

export const LOCALE = ru

export function fmtDate(ts: number | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!ts) return ''
  return format(ts, pattern, { locale: ru })
}

export function fmtDateTime(ts: number | null | undefined): string {
  return fmtDate(ts, 'd MMM, HH:mm')
}

/** "сегодня", "завтра", "вчера" or a short date. */
export function fmtDay(ts: number | null | undefined): string {
  if (!ts) return ''
  if (isToday(ts)) return 'сегодня'
  if (isTomorrow(ts)) return 'завтра'
  if (isYesterday(ts)) return 'вчера'
  return format(ts, 'd MMM', { locale: ru })
}

export function fmtRelative(ts: number | null | undefined): string {
  if (!ts) return ''
  return formatDistanceToNowStrict(ts, { locale: ru, addSuffix: true })
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

export function fmtHours(min: number): string {
  return `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)} ч`
}

export function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
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

/** Russian plural: plural(5, ['идея', 'идеи', 'идей']). */
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
