import { addDays } from 'date-fns'
import { ArrowRight, CalendarClock, Flag } from 'lucide-react'
import { PRIORITIES, type BoardColumn, type Card, type CardPatch } from '@shared/domain/boards'
import { useApiMutation } from '@/lib/query'
import { dayKey } from '@/lib/format'
import { defineRecordMenu, type MenuItemSpec } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { PRIORITY_LABEL } from './labels'
import { useRepeatToast } from './repeat'

/** A due date `days` from today at the card's own time (09:00 when it had none, as the date picker). */
function dueIn(days: number, current: number | null): number {
  const at = new Date(current ?? Date.now())
  const day = addDays(new Date(), days)
  day.setHours(current ? at.getHours() : 9, current ? at.getMinutes() : 0, 0, 0)
  return day.getTime()
}

/** A board card's right click and «⋯» (kanban, list, calendar of a board). */
export const cardMenu = defineRecordMenu<Card, { onOpen: () => void; columns: BoardColumn[] }>({
  title: (c) => c.title,
  entity: (c) => ({ type: 'card', id: c.id }),
  useGroups(c, { onOpen, columns }) {
    const ref = { type: 'card' as const, id: c.id }
    const notifyRepeat = useRepeatToast()
    const move = useApiMutation('cards', 'move', { onSuccess: notifyRepeat })
    // As the card sheet: a change that closes a repeating card says so (and offers the next one).
    const update = useApiMutation('cards', 'update', {
      onSuccess: (res) => notifyRepeat(res?.repeatOutcome)
    })
    const patch = (p: CardPatch): void => update.mutate({ id: c.id, patch: p })
    const due = (label: string, days: number): MenuItemSpec => {
      const at = dueIn(days, c.dueAt)
      return {
        label,
        checked: !!c.dueAt && dayKey(c.dueAt) === dayKey(at),
        run: () => patch({ dueAt: at })
      }
    }
    return {
      open: [useOpenItem(ref, onOpen)],
      state: [
        columns.length > 1 && {
          label: 'Перемістити в',
          icon: ArrowRight,
          items: columns.map((col) => ({
            label: col.title,
            checked: col.id === c.columnId,
            run: () =>
              col.id !== c.columnId && move.mutate({ cardId: c.id, columnId: col.id, index: 0 })
          }))
        },
        choiceSubmenu(
          'Пріоритет',
          Flag,
          PRIORITIES,
          c.priority,
          (p) => PRIORITY_LABEL[p],
          (priority) => patch({ priority })
        ),
        {
          label: 'Дедлайн',
          icon: CalendarClock,
          items: [
            due('Сьогодні', 0),
            due('Завтра', 1),
            due('Через тиждень', 7),
            {
              label: 'Без дедлайну',
              checked: !c.dueAt,
              run: () => c.dueAt && patch({ dueAt: null })
            }
          ]
        },
        useTagsSubmenu(c.tags, (tagIds) => patch({ tagIds }))
      ],
      danger: [useTrashItem('cards', ref, 'Картку переміщено в кошик')]
    }
  }
})
