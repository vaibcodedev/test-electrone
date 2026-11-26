import { toast } from 'sonner'
import { ExternalLink, FolderOpen, ImageIcon, Trash2 } from 'lucide-react'
import type { Attachment } from '@shared/domain/system'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { defineRecordMenu } from './model'

/** open / reveal / copy fail when the file was moved or deleted outside the app: say so. */
function fileAction(action: () => Promise<unknown>, failed: string, source: string): () => void {
  return () =>
    void action().catch((e) => {
      toast.error(failed)
      reportError(e, source)
    })
}

/**
 * A file in «Файли» of a record: the row's own actions. Deleting takes it off the disk (no trash), so it asks
 * first — and only while the record is being edited (`canDelete`), as the row's button.
 */
export const attachmentMenu = defineRecordMenu<Attachment, { canDelete: boolean }>({
  title: (f) => f.originalName,
  useGroups(f, { canDelete }) {
    const remove = useApiMutation('files', 'remove')
    const image = f.mime.startsWith('image/')
    return {
      open: [
        {
          label: 'Відкрити',
          icon: ExternalLink,
          run: fileAction(
            () => api.files.open(f.id),
            'Не вдалося відкрити файл — можливо, його переміщено',
            'files:open'
          )
        },
        {
          label: 'Показати в папці',
          icon: FolderOpen,
          run: fileAction(
            () => api.files.reveal(f.id),
            'Не вдалося відкрити файл — можливо, його переміщено',
            'files:reveal'
          )
        },
        image && {
          label: 'Копіювати зображення',
          icon: ImageIcon,
          run: fileAction(
            () => api.files.copyImage(f.path).then(() => toast.success('Зображення скопійовано')),
            'Не вдалося скопіювати зображення',
            'files:copy-image'
          )
        }
      ],
      danger: [
        canDelete && {
          label: 'Видалити файл',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: `Видалити файл «${f.originalName}»?`,
            description: 'Файл буде видалено з диска без можливості відновлення.',
            confirmLabel: 'Видалити'
          },
          run: () => remove.mutate(f.id)
        }
      ]
    }
  }
})
