import { Folder } from 'lucide-react'
import type { Note, NotePatch } from '@shared/domain/notes'
import { useApi, useApiMutation } from '@/lib/query'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem, useTagsSubmenu, useTrashItem } from '@/features/record-menu/actions'

/** A note's right click and «⋯». */
export const noteMenu = defineRecordMenu<Note, { onOpen: () => void }>({
  title: (n) => n.title,
  entity: (n) => ({ type: 'note', id: n.id }),
  useGroups(n, { onOpen }) {
    const ref = { type: 'note' as const, id: n.id }
    const update = useApiMutation('notes', 'update')
    const save = (patch: NotePatch): void => update.mutate({ id: n.id, patch })
    const { data: folders = [] } = useApi('notes', 'folders')
    return {
      open: [useOpenItem(ref, onOpen)],
      state: [
        // Only folders that exist: a new one is named in the note itself.
        (folders.length > 0 || !!n.folder) && {
          label: 'Папка',
          icon: Folder,
          items: [
            { label: 'Без папки', checked: !n.folder, run: () => n.folder && save({ folder: '' }) },
            ...folders.map((f) => ({
              label: f,
              checked: f === n.folder,
              run: () => f !== n.folder && save({ folder: f })
            }))
          ]
        },
        useTagsSubmenu(n.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('notes', ref, 'Нотатку переміщено в кошик')]
    }
  }
})
