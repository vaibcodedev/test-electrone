import type { CalendarItem } from '@shared/domain/calendar'

const SOURCE_COLOR: Record<CalendarItem['source'], string> = {
  event: 'var(--lime)',
  card: 'var(--info)',
  payment: 'var(--warn)',
  project: 'var(--success)'
}

export const SOURCE_LABEL: Record<CalendarItem['source'], string> = {
  event: 'Событие',
  card: 'Дедлайн карточки',
  payment: 'Оплата',
  project: 'Дедлайн проекта'
}

export function itemColor(item: CalendarItem): string {
  return item.color ?? SOURCE_COLOR[item.source]
}

/** Day key yyyy-mm-dd in local time. */
export function dayKey(ts: number | Date): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
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
