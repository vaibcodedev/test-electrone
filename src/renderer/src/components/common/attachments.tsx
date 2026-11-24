import { ExternalLink, FolderOpen, Paperclip, Trash2 } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fileUrl } from '@/lib/files'
import { fmtBytes } from '@/lib/format'
import { useFileDrop } from '@/hooks/use-file-drop'
import { cn } from '@/lib/utils'

/** Files attached to an entity. Stored in the data folder; the DB keeps only relative paths. */
export function AttachmentsPanel({ entity }: { entity: EntityRef }) {
  const { data: files = [] } = useApi('files', 'list', entity)
  const add = useApiMutation('files', 'add')
  const remove = useApiMutation('files', 'remove')
  const { isOver, props } = useFileDrop((sources) => sources.forEach((source) => add.mutate({ ref: entity, source })))

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[12px] text-muted-foreground">Файлы</h3>
      <div
        {...props}
        className={cn(
          'flex flex-col gap-1 rounded-2xl border border-dashed border-input p-2 transition-colors',
          isOver && 'border-ring bg-lime-soft'
        )}
      >
        {files.map((f) => (
          <div key={f.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface">
            {f.mime.startsWith('image/') ? (
              <img src={fileUrl(f.path)} alt="" className="size-8 rounded-lg object-cover" />
            ) : (
              <span className="grid size-8 place-items-center rounded-lg bg-surface">
                <Paperclip className="size-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px]">{f.originalName}</span>
              <span className="text-[11px] text-muted-foreground">{fmtBytes(f.size)}</span>
            </span>
            <div className="flex opacity-0 group-hover:opacity-100">
              <button type="button" title="Открыть" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => api.files.open(f.id)}>
                <ExternalLink className="size-3.5" />
              </button>
              <button type="button" title="Показать в папке" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => api.files.reveal(f.id)}>
                <FolderOpen className="size-3.5" />
              </button>
              <button type="button" title="Удалить файл" className="p-1 text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(f.id)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        <p className="px-2 py-1.5 text-center text-[11.5px] text-muted-foreground">Перетащите файлы сюда</p>
      </div>
    </section>
  )
}
