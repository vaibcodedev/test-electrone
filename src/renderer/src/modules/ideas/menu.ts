import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CircleDot, Flame, SquareKanban } from 'lucide-react'
import { IDEA_STATUSES, type Idea, type IdeaPatch } from '@shared/domain/ideas'
import { useApiMutation } from '@/lib/query'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { IDEA_STATUS_LABEL, IMPACT_LABEL } from './labels'

const IMPACTS = [0, 1, 2, 3] as const

/** An idea's right click and «⋯» (list rows): the same actions as its pane. */
export const ideaMenu = defineRecordMenu<Idea, { onOpen: () => void }>({
  title: (idea) => idea.title,
  entity: (idea) => ({ type: 'idea', id: idea.id }),
  useGroups(idea, { onOpen }) {
    const navigate = useNavigate()
    const ref = { type: 'idea' as const, id: idea.id }
    const update = useApiMutation('ideas', 'update')
    const patch = (p: IdeaPatch): void => update.mutate({ id: idea.id, patch: p })
    const convert = useApiMutation('ideas', 'convertToBoard', {
      onSuccess: (board) => {
        toast.success('Дошку створено')
        navigate(`/boards/${board.id}`)
      }
    })
    return {
      open: [
        useOpenItem(ref, onOpen),
        idea.boardId
          ? {
              label: 'Відкрити дошку',
              icon: SquareKanban,
              run: () => navigate(`/boards/${idea.boardId}`)
            }
          : {
              label: 'Перетворити на дошку',
              icon: SquareKanban,
              run: () => convert.mutate(idea.id)
            }
      ],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          IDEA_STATUSES,
          idea.status,
          (s) => IDEA_STATUS_LABEL[s],
          (status) => patch({ status })
        ),
        choiceSubmenu(
          'Важливість',
          Flame,
          IMPACTS,
          idea.impact as (typeof IMPACTS)[number],
          (n) => IMPACT_LABEL[n],
          (impact) => patch({ impact })
        ),
        useTagsSubmenu(idea.tags, (tagIds) => patch({ tagIds }))
      ],
      danger: [useTrashItem('ideas', ref, 'Ідею переміщено в кошик')]
    }
  }
})
