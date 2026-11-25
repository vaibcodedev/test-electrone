import type { CalendarItem } from '@shared/domain/calendar'
import { dayKey } from '@/lib/format'

/**
 * Fallback colours (chart tokens, contrast-checked). Payments, projects, subscriptions, interviews and follow-ups
 * bring their own from main (blue-violet, orange, lilac, teal), so cards take olive, not another blue.
 */
const SOURCE_COLOR: Record<CalendarItem['source'], string> = {
  event: 'var(--lime)',
  card: 'var(--chart-1)',
  payment: 'var(--chart-3)',
  project: 'var(--chart-4)',
  interview: 'var(--chart-5)',
  subscription: 'var(--chart-3)',
  followup: 'var(--muted-foreground)',
  credential: 'var(--chart-2)'
}

export const SOURCE_LABEL: Record<CalendarItem['source'], string> = {
  event: 'Подія',
  card: 'Дедлайн картки',
  payment: 'Оплата',
  project: 'Дедлайн проєкту',
  interview: 'Співбесіда',
  subscription: 'Підписка',
  followup: 'Нагадати про себе',
  credential: 'Термін доступу'
}

export function itemColor(item: CalendarItem): string {
  return item.color ?? SOURCE_COLOR[item.source]
}

/** Groups items by every local day they touch (multi-day events appear on each day). */
export function groupByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const start = new Date(item.startAt)
    start.setHours(0, 0, 0, 0)
    const end = item.endAt && item.endAt > item.startAt ? item.endAt : item.startAt
    for (let d = start.getTime(), i = 0; d <= end && i < 62; i++) {
      const key = dayKey(d)
      map.set(key, [...(map.get(key) ?? []), item])
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      d = next.getTime()
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startAt - b.startAt)
  }
  return map
}

const hm = (ts: number): string => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Time label for an item as seen on a given day. A multi-day event shows its start time on the first day,
 * "до 09:00" on the last day and nothing on the days in between (it runs all day there).
 * `short` fits a month cell, `long` is for the week view.
 */
export function timeOnDay(item: CalendarItem, day: Date): { short: string; long: string } {
  if (item.allDay) return { short: '', long: SOURCE_LABEL[item.source] }
  const key = dayKey(day)
  const startsToday = dayKey(item.startAt) === key
  const end = item.endAt && item.endAt > item.startAt ? item.endAt : null
  const endsToday = end !== null && dayKey(end) === key
  if (startsToday) {
    if (end === null) return { short: hm(item.startAt), long: hm(item.startAt) }
    return endsToday
      ? { short: hm(item.startAt), long: `${hm(item.startAt)}–${hm(end)}` }
      : { short: hm(item.startAt), long: `з ${hm(item.startAt)}` }
  }
  if (endsToday) return { short: `до ${hm(end)}`, long: `до ${hm(end)}` }
  return { short: '', long: 'увесь день' }
}
