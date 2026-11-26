import { Copy, ExternalLink } from 'lucide-react'
import type { ComponentPatch, UiComponent } from '@shared/domain/components'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { isLikelyUrl } from '@/lib/limits'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'

/** A UI component's right click and «⋯». */
export const componentMenu = defineRecordMenu<UiComponent, { onOpen: () => void }>({
  title: (c) => c.title,
  entity: (c) => ({ type: 'component', id: c.id }),
  useGroups(c, { onOpen }) {
    const ref = { type: 'component' as const, id: c.id }
    const update = useApiMutation('components', 'update')
    const save = (patch: ComponentPatch): void => update.mutate({ id: c.id, patch })
    const source = c.sourceUrl.trim()
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!c.code.trim() && {
          label: 'Копіювати код',
          icon: Copy,
          run: () => void copyText(c.code, 'Код скопійовано')
        },
        !!source &&
          isLikelyUrl(source) && {
            label: 'Відкрити джерело',
            icon: ExternalLink,
            run: () => void openUrl(source)
          }
      ],
      state: [useTagsSubmenu(c.tags, (tagIds) => save({ tagIds }))],
      danger: [useTrashItem('components', ref, 'Компонент переміщено в кошик')]
    }
  }
})
