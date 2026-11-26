import { CircleDot, Copy, ExternalLink } from 'lucide-react'
import { BOOKMARK_STATUSES, type Bookmark, type BookmarkPatch } from '@shared/domain/bookmarks'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import {
  choiceSubmenu,
  useOpenItem,
  useTagsSubmenu,
  useTrashItem
} from '@/features/record-menu/actions'
import { STATUS_LABEL } from './labels'

/** A bookmark's right click and «⋯»: the site, its address, the reading status. */
export const bookmarkMenu = defineRecordMenu<Bookmark, { onOpen: () => void }>({
  title: (b) => b.title,
  entity: (b) => ({ type: 'bookmark', id: b.id }),
  useGroups(b, { onOpen }) {
    const ref = { type: 'bookmark' as const, id: b.id }
    const update = useApiMutation('bookmarks', 'update')
    const save = (patch: BookmarkPatch): void => update.mutate({ id: b.id, patch })
    const url = b.url.trim()
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!url && { label: 'Відкрити сайт', icon: ExternalLink, run: () => void openUrl(url) }
      ],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          BOOKMARK_STATUSES,
          b.status,
          (s) => STATUS_LABEL[s],
          (status) => save({ status })
        ),
        useTagsSubmenu(b.tags, (tagIds) => save({ tagIds }))
      ],
      share: [
        !!url && { label: 'Копіювати адресу', icon: Copy, run: () => void copyText(url, 'Адресу скопійовано') }
      ],
      danger: [useTrashItem('bookmarks', ref, 'Закладку переміщено в кошик')]
    }
  }
})
