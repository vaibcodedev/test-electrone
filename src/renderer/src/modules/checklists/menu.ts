import { useNavigate } from 'react-router'
import { Braces, CircleCheck, Pencil, Rocket, Trash2 } from 'lucide-react'
import type { Checklist, ChecklistItem, ChecklistPatch } from '@shared/domain/checklists'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { copyAsJson } from '@/components/common/import-dialog'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'
import { checklistJson } from './use-checklist-order'

/** A checklist's right click and «⋯» (template and run cards). `onLaunch` — a template's «Запустити прогін». */
export const checklistMenu = defineRecordMenu<Checklist, { onLaunch?: () => void }>({
  title: (c) => c.title,
  entity: (c) => ({ type: 'checklist', id: c.id }),
  useGroups(c, { onLaunch }) {
    const navigate = useNavigate()
    const ref = { type: 'checklist' as const, id: c.id }
    const update = useApiMutation('checklists', 'update')
    const save = (patch: ChecklistPatch): void => update.mutate({ id: c.id, patch })
    return {
      open: [
        useOpenItem(ref, () => navigate(`/checklists/${c.id}`)),
        c.kind === 'template' &&
          !!onLaunch && { label: 'Запустити прогін', icon: Rocket, run: onLaunch }
      ],
      state: [useTagsSubmenu(c.tags, (tagIds) => save({ tagIds }))],
      share: [
        {
          label: 'Копіювати як JSON',
          icon: Braces,
          // The items only now: the card has none of them.
          run: () =>
            copyAsJson(
              api.checklists.get(c.id).then((d) => {
                if (!d) throw new Error('Чек-лист не знайдено')
                const items = [...d.items].sort((a, b) => a.position - b.position)
                return checklistJson(d.title, d.description, items)
              }),
              'Чек-лист'
            )
        }
      ],
      danger: [useTrashItem('checklists', ref, 'Чек-лист переміщено в кошик')]
    }
  }
})

/**
 * A step of a checklist: «Виконано» in a run; while editing — «Змінити» and «Видалити пункт» (asked: a step has no
 * trash). Not an entity: no pins or links.
 */
export const checklistItemMenu = defineRecordMenu<
  ChecklistItem,
  { isRun: boolean; editing: boolean; onEdit: () => void }
>({
  title: (i) => i.text,
  useGroups(i, { isRun, editing, onEdit }) {
    const update = useApiMutation('checklists', 'updateItem')
    const remove = useApiMutation('checklists', 'removeItem')
    return {
      open: [editing && { label: 'Змінити', icon: Pencil, run: onEdit }],
      state: [
        isRun && {
          label: 'Виконано',
          icon: CircleCheck,
          on: i.done,
          run: () => update.mutate({ id: i.id, patch: { done: !i.done } })
        }
      ],
      danger: [
        editing && {
          label: 'Видалити пункт',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: 'Видалити пункт?',
            description: `«${i.text}» буде видалено з чек-листа.`,
            confirmLabel: 'Видалити'
          },
          run: () => remove.mutate(i.id)
        }
      ]
    }
  }
})
