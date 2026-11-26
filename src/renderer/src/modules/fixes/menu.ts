import { CircleCheck } from 'lucide-react'
import type { Fix, FixPatch } from '@shared/domain/fixes'
import { useApiMutation } from '@/lib/query'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'

/** An error-and-fix's right click and «⋯». */
export const fixMenu = defineRecordMenu<Fix, { onOpen: () => void }>({
  title: (f) => f.title,
  entity: (f) => ({ type: 'fix', id: f.id }),
  useGroups(f, { onOpen }) {
    const ref = { type: 'fix' as const, id: f.id }
    const update = useApiMutation('fixes', 'update')
    const save = (patch: FixPatch): void => update.mutate({ id: f.id, patch })
    return {
      open: [useOpenItem(ref, onOpen)],
      state: [
        { label: 'Вирішено', icon: CircleCheck, on: f.resolved, run: () => save({ resolved: !f.resolved }) },
        useTagsSubmenu(f.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('fixes', ref, 'Помилку переміщено в кошик')]
    }
  }
})
