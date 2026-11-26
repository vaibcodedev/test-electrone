import { CircleCheck, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { openUrl } from '@/lib/open-url'
import { defineRecordMenu, type ConfirmSpec } from '@/features/record-menu/model'

/** What a finance row offers: its own buttons' actions (rows are not entities: no pins, no trash). */
export interface FinanceRowActions {
  onEdit: () => void
  onRemove: () => void
  /** Deleting is for good: always asked first. */
  removeConfirm: ConfirmSpec
  /** A subscription's month: «Оплачено» on/off. */
  paid?: { on: boolean; toggle: () => void }
  url?: string
}

/** A row of Фінанси (expense, subscription, withdrawal): right click with the row's own actions. */
export const financeRowMenu = defineRecordMenu<{ title: string }, FinanceRowActions>({
  title: (r) => r.title,
  useGroups(_r, { onEdit, onRemove, removeConfirm, paid, url }) {
    return {
      open: [
        { label: 'Змінити', icon: Pencil, run: onEdit },
        !!url && { label: 'Відкрити сайт', icon: ExternalLink, run: () => void openUrl(url) }
      ],
      state: [!!paid && { label: 'Оплачено', icon: CircleCheck, on: paid.on, run: paid.toggle }],
      danger: [
        {
          label: 'Видалити',
          icon: Trash2,
          destructive: true,
          confirm: removeConfirm,
          run: onRemove
        }
      ]
    }
  }
})
