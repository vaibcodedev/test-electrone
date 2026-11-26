import { CircleDot, ExternalLink } from 'lucide-react'
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  type Application,
  type ApplicationPatch
} from '@shared/domain/jobs'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'

/** A vacancy's right click (list rows): the post, the status. */
export const applicationMenu = defineRecordMenu<Application, { onOpen: () => void }>({
  title: (a) => a.title,
  entity: (a) => ({ type: 'application', id: a.id }),
  useGroups(a, { onOpen }) {
    const ref = { type: 'application' as const, id: a.id }
    const update = useApiMutation('jobs', 'update')
    const save = (patch: ApplicationPatch): void => update.mutate({ id: a.id, patch })
    const url = a.url.trim()
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!url && { label: 'Відкрити вакансію', icon: ExternalLink, run: () => void openUrl(url) }
      ],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          APPLICATION_STATUSES,
          a.status,
          (s) => APPLICATION_STATUS_LABEL[s],
          (status) => save({ status })
        ),
        useTagsSubmenu(a.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('jobs', ref, 'Вакансію переміщено в кошик')]
    }
  }
})
