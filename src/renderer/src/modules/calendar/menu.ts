import { Plus } from 'lucide-react'
import type { CalendarItem } from '@shared/domain/calendar'
import { useApi } from '@/lib/query'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTrashItem } from '@/features/record-menu/actions'

/**
 * An item of the calendar grid (an event, a card's deadline, a payment…): «Відкрити»; an own event also goes to
 * the trash from here. An event of a vacancy stage is removed with its stage, so it gets no «У кошик» (its
 * source is read only while the menu is open). Events have no pins or tags.
 */
export const calendarItemMenu = defineRecordMenu<CalendarItem, { onOpen: () => void }>({
  title: (i) => i.title,
  useGroups(i, { onOpen }) {
    const event = i.source === 'event'
    const { data: own } = useApi('events', 'get', i.ref.id, { enabled: event })
    const trash = useTrashItem(
      'events',
      { type: 'event', id: i.ref.id },
      'Подію переміщено в кошик'
    )
    return {
      open: [useOpenItem(null, onOpen)],
      danger: [event && !!own && !own.sourceType && trash]
    }
  }
})

/** A day of the month grid: «Нова подія» on it (the only empty-area menu). */
export const calendarDayMenu = defineRecordMenu<Date, { onNew: () => void }>({
  title: (d) => d.toLocaleDateString('uk', { day: 'numeric', month: 'long' }),
  useGroups(_d, { onNew }) {
    return { open: [{ label: 'Нова подія', icon: Plus, run: onNew }] }
  }
})
