import { useRef } from 'react'
import { ExternalLink, FolderOpen, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { EntityRef } from '@shared/domain/common'
import type { FileSource } from '@shared/domain/designs'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fileUrl, toFileSources } from '@/lib/files'
import { fmtBytes } from '@/lib/format'
import { reportError } from '@/lib/error-reporting'
import { useFileDrop } from '@/hooks/use-file-drop'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Confirm } from './confirm'
import { IconAction } from './icon-action'
import { SectionLabel } from './section-label'

/** open / reveal fail when the file was moved or deleted outside the app: say so instead of an unhandled error. */
function openFile(action: Promise<unknown>, source: string): void {
  action.catch((e) => {
    toast.error('Не вдалося відкрити файл — можливо, його переміщено')
    reportError(e, source)
  })
}

/** Files attached to an entity. Stored in the data folder; the DB keeps only relative paths. */
export function AttachmentsPanel({ entity }: { entity: EntityRef }) {
  const { data: files = [] } = useApi('files', 'list', entity)
  const add = useApiMutation('files', 'add')
  const remove = useApiMutation('files', 'remove')
  const picker = useRef<HTMLInputElement>(null)
  const addAll = (sources: FileSource[]): void => sources.forEach((source) => add.mutate({ ref: entity, source }))
  const { isOver, props } = useFileDrop(addAll)

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Файли</SectionLabel>
      <div {...props} className={cn('flex flex-col gap-1 rounded-2xl transition-colors', isOver && 'bg-lime-soft')}>
        {files.map((f) => (
          <Item key={f.id} size="xs" className="group hover:bg-surface">
            <ItemMedia variant="image" className="size-8">
              {f.mime.startsWith('image/') ? <img src={fileUrl(f.path)} alt="" /> : <Paperclip className="size-4" />}
            </ItemMedia>
            <ItemContent className="min-w-0 gap-0">
              <ItemTitle className="w-full truncate text-caption font-normal" title={f.originalName}>
                {f.originalName}
              </ItemTitle>
              <ItemDescription className="text-meta">{fmtBytes(f.size)}</ItemDescription>
            </ItemContent>
            {/* Shown on hover and whenever keyboard focus is inside the row. */}
            <ItemActions className="gap-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <IconAction label="Відкрити" onClick={() => openFile(api.files.open(f.id), 'files:open')}>
                <ExternalLink />
              </IconAction>
              <IconAction label="Показати в папці" onClick={() => openFile(api.files.reveal(f.id), 'files:reveal')}>
                <FolderOpen />
              </IconAction>
              {/* Removing deletes the file from disk (no trash for attachments), so it asks first. */}
              <Confirm
                title={`Видалити файл «${f.originalName}»?`}
                description="Файл буде видалено з диска без можливості відновлення."
                onConfirm={() => remove.mutate(f.id)}
              >
                <IconAction label="Видалити файл" data-edit-only className="hover:text-destructive">
                  <Trash2 />
                </IconAction>
              </Confirm>
            </ItemActions>
          </Item>
        ))}
        {/* A real action (keyboard, no drag needed), like «Зв’язати» available while reading; dropping still works. */}
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-transparent p-1 transition-colors',
            isOver && 'border-ring'
          )}
        >
          <Button variant="subtle" size="xs" onClick={() => picker.current?.click()}>
            <Paperclip /> Додати файл
          </Button>
          <span className="text-meta text-muted-foreground">
            або перетягніть сюди
          </span>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              const picked = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (picked.length) addAll(await toFileSources(picked))
            }}
          />
        </div>
      </div>
    </section>
  )
}
