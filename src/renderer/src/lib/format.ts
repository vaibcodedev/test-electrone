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
    // Paired markers only: «process_env» and «2 * 3» keep their characters.
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?![\w])/g, '$1$2')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
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
