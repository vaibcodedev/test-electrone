import { plural } from '@/lib/format'
import { useApi } from '@/lib/query'

export interface TodayProgress {
  /** Cards due today plus overdue ones that are already in a done column. */
  done: number
  total: number
  /** The user's name from settings, trimmed; empty when not set. */
  name: string
}

/** Today's cards for the sidebar's lime card (expanded) and its tile (collapsed): one source for both. */
export function useTodayProgress(): TodayProgress {
  const { data: settings } = useApi('settings', 'get')
  const { data: dash } = useApi('app', 'dashboard')
  const cards = dash ? [...dash.today.cards, ...dash.today.overdue] : []
  return {
    done: cards.filter((c) => c.columnIsDone).length,
    total: cards.length,
    name: settings?.userName?.trim() ?? ''
  }
}

/** «Сьогодні 2 з 5 завдань» / «На сьогодні завдань немає». */
export function todayLabel(done: number, total: number): string {
  return total
    ? `Сьогодні ${done} з ${total} ${plural(total, ['завдання', 'завдань', 'завдань'])}`
    : 'На сьогодні завдань немає'
}
