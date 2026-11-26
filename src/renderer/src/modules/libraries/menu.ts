import { BookOpen, CircleDot, Copy, GitBranch, Package } from 'lucide-react'
import {
  LIBRARY_STATUS_LABEL,
  LIBRARY_STATUSES,
  type Library,
  type LibraryPatch
} from '@shared/domain/libraries'
import { isLikelyUrl } from '@/lib/limits'
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

const site = (url: string, label: string, icon: typeof Package) =>
  !!url.trim() && isLikelyUrl(url) && { label, icon, run: () => void openUrl(url) }

/** A JS library's right click and «⋯»: the install command, its sites, the status. */
export const libraryMenu = defineRecordMenu<Library, { onOpen: () => void }>({
  title: (l) => l.name,
  entity: (l) => ({ type: 'library', id: l.id }),
  useGroups(l, { onOpen }) {
    const ref = { type: 'library' as const, id: l.id }
    const update = useApiMutation('libraries', 'update')
    const save = (patch: LibraryPatch): void => update.mutate({ id: l.id, patch })
    return {
      open: [
        useOpenItem(ref, onOpen),
        !!l.installCmd.trim() && {
          label: 'Копіювати команду',
          icon: Copy,
          run: () => void copyText(l.installCmd, 'Команду скопійовано')
        },
        site(l.npmUrl, 'Відкрити npm', Package),
        site(l.githubUrl, 'Відкрити GitHub', GitBranch),
        site(l.docsUrl, 'Відкрити документацію', BookOpen)
      ],
      state: [
        choiceSubmenu(
          'Статус',
          CircleDot,
          LIBRARY_STATUSES,
          l.status,
          (s) => LIBRARY_STATUS_LABEL[s],
          (status) => save({ status })
        ),
        useTagsSubmenu(l.tags, (tagIds) => save({ tagIds }))
      ],
      danger: [useTrashItem('libraries', ref, 'Бібліотеку переміщено в кошик')]
    }
  }
})
