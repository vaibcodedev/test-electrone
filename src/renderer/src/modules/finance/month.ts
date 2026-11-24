import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { LOCALE } from '@/lib/format'

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

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** "Ноябрь 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return capitalize(format(new Date(y, m - 1, 1), 'LLLL yyyy', { locale: LOCALE }))
}

/** "ноябрь" (for «Подписки на ноябрь»). */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'LLLL', { locale: LOCALE })
}

/** Short label for chart axes: "ноя". */
export function monthShort(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return format(new Date(y, m - 1, 1), 'LLL', { locale: LOCALE }).replace('.', '')
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
