import { CircleCheck, CircleDashed } from 'lucide-react'
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
        f.resolved
          ? {
              label: 'Позначити невирішеною',
              icon: CircleDashed,
              run: () => save({ resolved: false })
            }
          : {
              label: 'Позначити вирішеною',
              icon: CircleCheck,
              run: () => save({ resolved: true })
            },
        useTagsSubmenu(f.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('fixes', ref, 'Помилку переміщено в кошик')]
    }
  }
})
