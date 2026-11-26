import { RotateCcw, Trash2 } from 'lucide-react'
import type { TrashItem } from '@shared/domain/system'
import { shortTitle } from '@/features/short-title'
import { defineRecordMenu } from './model'

/** A row of «Кошик»: the page's own two actions. Deleting for good asks first. */
export const trashMenu = defineRecordMenu<
  TrashItem,
  { restore: (item: TrashItem) => void; purge: (item: TrashItem) => void }
>({
  title: (i) => i.title,
  useGroups(i, { restore, purge }) {
    return {
      open: [{ label: 'Відновити', icon: RotateCcw, run: () => restore(i) }],
      danger: [
        {
          label: 'Видалити назавжди',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: 'Видалити назавжди?',
            description: `«${shortTitle(i.title)}» буде видалено без можливості відновлення.`,
            confirmLabel: 'Видалити назавжди'
          },
          run: () => purge(i)
        }
      ]
    }
  }
})
