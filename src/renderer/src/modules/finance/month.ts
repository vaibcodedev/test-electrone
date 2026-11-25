import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { LOCALE, capitalize } from '@/lib/format'

/** "yyyy-mm" of the current local month. */
export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** [start, end] epoch ms of a "yyyy-mm" month (local time). */
export function monthRange(month: string): [number, number] {
  const [y, m] = month.split('-').map(Number)
  return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime() - 1]
}

/** Default date for a new record in the month: now in the current month, otherwise noon of its 1st. */
export function defaultDayIn(month: string): number {
  if (month === currentMonth()) return Date.now()
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1, 12).getTime()
}

/** «Січень» … «Грудень» — month names for selects (index 0–11). */
export const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  capitalize(format(new Date(2000, i, 1), 'LLLL', { locale: LOCALE }))
)

/** date-fns `LLL` cuts uk words mid-syllable («листоп», «верес»), so axis labels are fixed. */
const MONTH_SHORT = [
  'січ',
  'лют',
  'бер',
  'кві',
  'тра',
  'чер',
  'лип',
  'сер',
  'вер',
  'жов',
  'лис',
  'гру'
]

/** «Листопад 2026» */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return capitalize(format(new Date(y, m - 1, 1), 'LLLL yyyy', { locale: LOCALE }))
}

/** «листопад» — inside a phrase: «Підписки на листопад». */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'LLLL', { locale: LOCALE })
}

/** «лис» — chart axis label. */
export function monthShort(month: string): string {
  return MONTH_SHORT[Number(month.split('-')[1]) - 1]
}

/** Selected month lives in the URL (?month=yyyy-mm) so it survives navigation between finance pages. */
export function useMonth(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('month')
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth()
  const setMonth = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === currentMonth()) p.delete('month')
          else p.set('month', next)
          return p
        },
        { replace: true }
      )
    },
    [setParams]
  )
  return [month, setMonth]
}
