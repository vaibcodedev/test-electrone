import { Compass, Copy, MessagesSquare } from 'lucide-react'
import {
  PURPOSE_LABEL,
  TEMPLATE_PURPOSES,
  TEMPLATE_SITUATIONS,
  situationLabel,
  templateVersions,
  type MessageTemplate,
  type TemplatePatch
} from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { useOwnSituations } from './situation-combobox'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'

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
    // The person's own situations follow the built-in ones, as in the filter chips.
    const own = useOwnSituations()
    const situations = [...new Set<string>([...TEMPLATE_SITUATIONS, ...own, t.situation])]
    return {
      open: [
        useOpenItem(ref, onOpen),
        templateVersions(t).some((v) => v.body.trim()) && {
          label: 'Скопіювати…',
          icon: Copy,
          run: onCopy
        }
      ],
      state: [
        choiceSubmenu(
          'Ситуація',
          MessagesSquare,
          situations,
          t.situation,
          situationLabel,
          (situation) => save({ situation })
        ),
        // No value: a main from before the field (dev not restarted) — nothing to show or to save.
        !!t.purpose &&
          choiceSubmenu(
            'Для чого',
            Compass,
            TEMPLATE_PURPOSES,
            t.purpose,
            (p) => PURPOSE_LABEL[p],
            (purpose) => save({ purpose })
          ),
        useTagsSubmenu(t.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('templates', ref, 'Шаблон переміщено в кошик')]
    }
  }
})
