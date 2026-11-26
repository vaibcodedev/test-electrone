import { TagIcon, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import type { EntitySummary } from '@shared/domain/common'
import { api } from '@/lib/api'
import { invalidateAll, useApiMutation } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { defineRecordMenu } from './model'
import { useOpenItem } from './actions'

/** What the row's place adds: its own open handler, the link it stands for, the tag whose list it is in. */
export interface EntityMenuContext {
  onOpen?: () => void
  /** «Прибрати зв’язок» (a row of «Зв’язки»). */
  linkId?: string
  /** «Зняти мітку «…»» (a row of the tag's page). */
  tag?: { id: string; name: string }
}

/**
 * The menu of a record known only by its summary — rows of the home page, «Мітки», «Зв’язки», «Підсумки тижня»,
 * `vault:` links in text: «Відкрити», what the place offers, pins and «Копіювати посилання».
 */
export const entityMenu = defineRecordMenu<EntitySummary, EntityMenuContext | undefined>({
  title: (e) => e.title,
  entity: (e) => ({ type: e.type, id: e.id }),
  useGroups(e, ctx) {
    const ref = { type: e.type, id: e.id }
    const unlink = useApiMutation('links', 'remove', { successMessage: 'Зв’язок прибрано' })
    const untag = useApiMutation('tags', 'setOn', {
      onSuccess: (_r, args) => {
        if (args.on) return
        toast.success('Мітку знято', {
          action: {
            label: 'Скасувати',
            onClick: () =>
              void api.tags.setOn({ ...args, on: true }).then(invalidateAll, (err) => {
                toast.error('Не вдалося повернути мітку')
                reportError(err, 'entity-menu:retag')
              })
          }
        })
      }
    })
    const { linkId, tag } = ctx ?? {}
    return {
      open: [useOpenItem(ref, ctx?.onOpen)],
      state: [
        !!linkId && { label: 'Прибрати зв’язок', icon: Unlink, run: () => unlink.mutate(linkId) },
        tag && {
          label: 'Зняти цю мітку',
          icon: TagIcon,
          run: () => untag.mutate({ tagId: tag.id, ref, on: false })
        }
      ]
    }
  }
})
