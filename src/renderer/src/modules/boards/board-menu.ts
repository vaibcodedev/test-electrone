import { useNavigate } from 'react-router'
import { Archive } from 'lucide-react'
import type { BoardPatch, BoardSummary } from '@shared/domain/boards'
import { useApiMutation } from '@/lib/query'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'

/** A board tile's right click and «⋯». A whole board goes to the trash only after a question (its cards go too). */
export const boardMenu = defineRecordMenu<BoardSummary>({
  title: (b) => b.title,
  entity: (b) => ({ type: 'board', id: b.id }),
  useGroups(b) {
    const navigate = useNavigate()
    const ref = { type: 'board' as const, id: b.id }
    const update = useApiMutation('boards', 'update')
    const save = (patch: BoardPatch): void => update.mutate({ id: b.id, patch })
    const trash = useTrashItem('boards', ref, 'Дошку переміщено в кошик')
    return {
      open: [useOpenItem(ref, () => navigate(`/boards/${b.id}`))],
      state: [
        {
          label: 'Архів',
          icon: Archive,
          on: b.archived,
          run: () => save({ archived: !b.archived })
        },
        useTagsSubmenu(b.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [
        {
          ...trash,
          confirm: {
            title: `Видалити дошку «${b.title}»?`,
            description: 'Дошка та її картки підуть у кошик на 30 днів.',
            confirmLabel: 'У кошик'
          }
        }
      ]
    }
  }
})
