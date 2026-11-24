import { ExternalLink, FolderOpen, Paperclip, Trash2 } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fileUrl } from '@/lib/files'
import { fmtBytes } from '@/lib/format'
import { useFileDrop } from '@/hooks/use-file-drop'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Empty, EmptyDescription } from '@/components/ui/empty'

/** Files attached to an entity. Stored in the data folder; the DB keeps only relative paths. */
export function AttachmentsPanel({ entity }: { entity: EntityRef }) {
  const { data: files = [] } = useApi('files', 'list', entity)
  const add = useApiMutation('files', 'add')
  const remove = useApiMutation('files', 'remove')
  const { isOver, props } = useFileDrop((sources) => sources.forEach((source) => add.mutate({ ref: entity, source })))

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-caption font-semibold text-muted-foreground">Файли</h3>
      <div {...props} className={cn('flex flex-col gap-1 rounded-2xl transition-colors', isOver && 'bg-lime-soft')}>
        {files.map((f) => (
          <Item key={f.id} size="xs" className="group hover:bg-surface">
            <ItemMedia variant="image" className="size-8">
              {f.mime.startsWith('image/') ? <img src={fileUrl(f.path)} alt="" /> : <Paperclip className="size-4" />}
            </ItemMedia>
            <ItemContent className="min-w-0 gap-0">
              <ItemTitle className="w-full truncate text-caption font-normal">{f.originalName}</ItemTitle>
              <ItemDescription className="text-meta">{fmtBytes(f.size)}</ItemDescription>
            </ItemContent>
            <ItemActions className="gap-0 opacity-0 group-hover:opacity-100">
              <Button variant="ghost" size="icon-xs" aria-label="Відкрити" onClick={() => api.files.open(f.id)}>
                <ExternalLink />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Показати в папці" onClick={() => api.files.reveal(f.id)}>
                <FolderOpen />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Видалити файл" className="hover:text-destructive" onClick={() => remove.mutate(f.id)}>
                <Trash2 />
              </Button>
            </ItemActions>
          </Item>
        ))}
        <Empty className={cn('gap-0 border border-dashed border-input p-3 md:p-3', isOver && 'border-ring')}>
          <EmptyDescription className="text-meta">Перетягніть файли сюди</EmptyDescription>
        </Empty>
      </div>
    </section>
  )
}
