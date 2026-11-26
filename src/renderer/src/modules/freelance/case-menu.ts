import { ExternalLink } from 'lucide-react'
import type { CasePatch, PortfolioCase } from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { isLikelyUrl } from '@/lib/limits'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'

/** A portfolio case's right click and «⋯». */
export const caseMenu = defineRecordMenu<PortfolioCase, { onOpen: () => void }>({
  title: (c) => c.title,
  entity: (c) => ({ type: 'case', id: c.id }),
  useGroups(c, { onOpen }) {
    const ref = { type: 'case' as const, id: c.id }
    const update = useApiMutation('cases', 'update')
    const save = (patch: CasePatch): void => update.mutate({ id: c.id, patch })
    const url = c.url.trim()
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!url &&
          isLikelyUrl(url) && {
            label: 'Відкрити сайт',
            icon: ExternalLink,
            run: () => void openUrl(url)
          }
      ],
      state: [useTagsSubmenu(c.tags, (tagIds) => save({ tagIds }))],
      danger: [useTrashItem('cases', ref, 'Кейс переміщено в кошик')]
    }
  }
})
