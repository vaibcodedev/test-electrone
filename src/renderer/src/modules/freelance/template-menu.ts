import { Copy, MessagesSquare } from 'lucide-react'
import { TEMPLATE_SITUATIONS, type MessageTemplate, type TemplatePatch } from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { SITUATION_LABEL } from './g2-labels'

/** A message template's right click and «⋯»: «Скопіювати…» asks for the gaps first, like the button. */
export const templateMenu = defineRecordMenu<
  MessageTemplate,
  { onOpen: () => void; onCopy: () => void }
>({
  title: (t) => t.title,
  entity: (t) => ({ type: 'template', id: t.id }),
  useGroups(t, { onOpen, onCopy }) {
    const ref = { type: 'template' as const, id: t.id }
    const update = useApiMutation('templates', 'update')
    const save = (patch: TemplatePatch): void => update.mutate({ id: t.id, patch })
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!t.body.trim() && { label: 'Скопіювати…', icon: Copy, run: onCopy }
      ],
      state: [
        choiceSubmenu(
          'Ситуація',
          MessagesSquare,
          TEMPLATE_SITUATIONS,
          t.situation,
          (s) => SITUATION_LABEL[s],
          (situation) => save({ situation })
        ),
        useTagsSubmenu(t.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('templates', ref, 'Шаблон переміщено в кошик')]
    }
  }
})
