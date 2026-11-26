import { toast } from 'sonner'
import { ExternalLink, FolderOpen, ImageIcon, LayoutGrid, ListX } from 'lucide-react'
import type { Design, DesignPatch, Moodboard } from '@shared/domain/designs'
import { api } from '@/lib/api'
import { useApi, useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { isLikelyUrl } from '@/lib/limits'
import { revealStoredFile } from '@/lib/files'
import { reportError } from '@/lib/error-reporting'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'
import { designTitle } from './labels'
import { isVideoPath } from './media'

async function copyImage(path: string): Promise<void> {
  try {
    await api.files.copyImage(path)
    toast.success('Зображення скопійовано')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Не вдалося скопіювати зображення')
    reportError(e, 'design-menu:copy-image')
  }
}

/**
 * A design's right click and «⋯» (gallery, moodboard): the picture itself (copy, show in the folder), the
 * moodboards it is in. In a moodboard (`moodboardId`) — «Прибрати з добірки».
 */
export const designMenu = defineRecordMenu<
  Design,
  {
    onOpen: () => void
    /** In a moodboard: its own removal (with «Скасувати» back to the same place). */
    moodboard?: { id: string; title: string; remove: () => void }
  }
>({
  title: (d) => designTitle(d),
  entity: (d) => ({ type: 'design', id: d.id }),
  useGroups(d, { onOpen, moodboard }) {
    const ref = { type: 'design' as const, id: d.id }
    const update = useApiMutation('designs', 'update')
    const save = (patch: DesignPatch): void => update.mutate({ id: d.id, patch })
    // `contains` per moodboard comes from the server, asked only while the menu is open.
    const { data: boards = [] } = useApi('moodboards', 'list', { designId: d.id })
    // Toasts from the hooks' own options: the menu is gone by the time the answer comes, and per-call callbacks of
    // an unmounted hook never run.
    const titleOf = (id: string): string => boards.find((b) => b.id === id)?.title ?? 'добірки'
    const add = useApiMutation('moodboards', 'addDesigns', {
      onSuccess: (_r, v) => toast.success(`Дизайн додано в «${titleOf(v.moodboardId)}»`)
    })
    const takeOut = useApiMutation('moodboards', 'removeDesign', {
      onSuccess: (_r, v) => toast.success(`Дизайн прибрано з «${titleOf(v.moodboardId)}»`)
    })
    const image = d.imagePath && !isVideoPath(d.imagePath) ? d.imagePath : null
    const source = d.sourceUrl.trim()
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!image && { label: 'Копіювати зображення', icon: ImageIcon, run: () => copyImage(image) },
        !!d.imagePath && {
          label: 'Показати в папці',
          icon: FolderOpen,
          run: () => void revealStoredFile(d.imagePath!)
        },
        !!source &&
          isLikelyUrl(source) && {
            label: 'Відкрити джерело',
            icon: ExternalLink,
            run: () => void openUrl(source)
          }
      ],
      state: [
        !!moodboard && {
          label: 'Прибрати з добірки',
          icon: ListX,
          run: () => moodboard.remove()
        },
        boards.length > 0 && {
          label: 'У добірку',
          icon: LayoutGrid,
          items: boards.map((b) => ({
            label: b.title,
            checked: !!b.contains,
            run: () =>
              b.contains
                ? takeOut.mutate({ moodboardId: b.id, designId: d.id })
                : add.mutate({ moodboardId: b.id, designIds: [d.id] })
          }))
        },
        useTagsSubmenu(d.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('designs', ref, 'Дизайн переміщено в кошик')]
    }
  }
})

/** A moodboard tile's right click (gallery strip, «Усі добірки»). */
export const moodboardMenu = defineRecordMenu<Moodboard, { onOpen: () => void }>({
  title: (b) => b.title,
  entity: (b) => ({ type: 'moodboard', id: b.id }),
  useGroups(b, { onOpen }) {
    const ref = { type: 'moodboard' as const, id: b.id }
    const update = useApiMutation('moodboards', 'update')
    return {
      open: [useOpenItem(ref, onOpen)],
      state: [useTagsSubmenu(b.tags, (tagIds) => update.mutate({ id: b.id, patch: { tagIds } }))],
      danger: [
        useTrashItem('moodboards', ref, 'Добірку переміщено в кошик — дизайни залишилися в галереї')
      ]
    }
  }
})
