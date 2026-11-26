import { CircleDot, Pencil, Trash2 } from 'lucide-react'
import { PAYMENT_STATUSES, type Payment, type TimeEntry } from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { fmtDay, fmtMinutes, fmtMoney } from '@/lib/format'
import { defineRecordMenu } from '@/features/record-menu/model'
import { choiceSubmenu } from '@/features/record-menu/actions'
import { PAYMENT_STATUS_LABEL } from './labels'

/** "<1 хв" for short entries, otherwise «1 год 5 хв». */
export const fmtDuration = (min: number): string => (min < 1 ? '<1 хв' : fmtMinutes(min))

/**
 * A project payment's right click (a table row): the pencil, the status select and the trash of the row.
 * Not an entity of the registry: no pins, no link; deleted for good, so it asks.
 */
export const paymentMenu = defineRecordMenu<Payment, { stage: boolean; onEdit: () => void }>({
  title: (p) => p.note || fmtMoney(p.amount, p.currency),
  useGroups(p, { stage, onEdit }) {
    const update = useApiMutation('payments', 'update')
    const remove = useApiMutation('payments', 'remove')
    return {
      open: [{ label: 'Змінити', icon: Pencil, run: onEdit }],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          PAYMENT_STATUSES,
          p.status,
          (s) => PAYMENT_STATUS_LABEL[s],
          (status) => update.mutate({ id: p.id, patch: { status } })
        )
      ],
      danger: [
        {
          label: 'Видалити',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: `Видалити ${stage ? 'етап' : 'оплату'} ${fmtMoney(p.amount, p.currency)}?`,
            description: 'Відновити не можна.',
            confirmLabel: 'Видалити'
          },
          run: () => remove.mutate(p.id)
        }
      ]
    }
  }
})

/** A time entry's right click in the project's history: the same two actions as its buttons. */
export const timeEntryMenu = defineRecordMenu<TimeEntry, { onEdit: () => void }>({
  title: (e) => e.description || `${fmtDay(e.startedAt)}, ${fmtDuration(e.minutes)}`,
  useGroups(e, { onEdit }) {
    const remove = useApiMutation('time', 'remove')
    return {
      open: [{ label: 'Змінити', icon: Pencil, run: onEdit }],
      danger: [
        {
          label: 'Видалити',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: `Видалити запис ${fmtDuration(e.minutes)}?`,
            description: 'Відновити не можна.',
            confirmLabel: 'Видалити'
          },
          run: () => remove.mutate(e.id)
        }
      ]
    }
  }
})
