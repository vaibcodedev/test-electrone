import { Copy, Shapes } from 'lucide-react'
import { WORD_KINDS, type Word, type WordPatch } from '@shared/domain/english'
import { useApiMutation } from '@/lib/query'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { KIND_LABEL } from './labels'

/**
 * A word's right click and «⋯». Its stage («Вчу», «Вивчене») comes from the reviews, so the menu doesn't set it.
 */
export const wordMenu = defineRecordMenu<Word, { onOpen: () => void }>({
  title: (w) => w.term,
  entity: (w) => ({ type: 'word', id: w.id }),
  useGroups(w, { onOpen }) {
    const ref = { type: 'word' as const, id: w.id }
    const update = useApiMutation('english', 'update')
    const save = (patch: WordPatch): void => update.mutate({ id: w.id, patch })
    return {
      open: [
        useOpenItem(ref, onOpen),
        { label: 'Копіювати слово', icon: Copy, run: () => void copyText(w.term, 'Слово скопійовано') }
      ],
      state: [
        choiceSubmenu('Тип', Shapes, WORD_KINDS, w.kind, (k) => KIND_LABEL[k], (kind) => save({ kind })),
        useTagsSubmenu(w.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('english', ref, 'Слово переміщено в кошик')]
    }
  }
})
