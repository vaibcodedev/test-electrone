import { useNavigate } from 'react-router'
import { Braces, Rocket } from 'lucide-react'
import type { Checklist, ChecklistPatch } from '@shared/domain/checklists'
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
        c.kind === 'template' && !!onLaunch && { label: 'Запустити прогін', icon: Rocket, run: onLaunch }
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
