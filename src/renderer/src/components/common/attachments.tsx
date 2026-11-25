import { useRef } from 'react'
import { ExternalLink, FolderOpen, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { EntityRef } from '@shared/domain/common'
import type { Attachment } from '@shared/domain/system'
import type { FileSource } from '@shared/domain/designs'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fileUrl, toFileSources } from '@/lib/files'
import { fmtBytes } from '@/lib/format'
import { reportError } from '@/lib/error-reporting'
import { useFileDrop } from '@/hooks/use-file-drop'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Confirm } from './confirm'
import { IconAction } from './icon-action'
import { SectionLabel } from './section-label'
import { useFold } from '@/hooks/use-fold'
import { FoldButton } from './fold-button'

/** open / reveal fail when the file was moved or deleted outside the app: say so instead of an unhandled error. */
function openFile(action: Promise<unknown>, source: string): void {
  action.catch((e) => {
    toast.error('Не вдалося відкрити файл — можливо, його переміщено')
    reportError(e, source)
  })
}

/** One empty list for every render while loading: useFold memoises on the array itself. */
const NO_FILES: Attachment[] = []

/** Files attached to an entity. Stored in the data folder; the DB keeps only relative paths. */
export function AttachmentsPanel({ entity }: { entity: EntityRef }) {
  const { data: files = NO_FILES } = useApi('files', 'list', entity)
  // Folded to five, as «Зв’язки» and «Згадки»: a record with a dozen screenshots filled the aside.
  const fold = useFold(files)
  const add = useApiMutation('files', 'add')
  const remove = useApiMutation('files', 'remove')
  const picker = useRef<HTMLInputElement>(null)
  const addAll = (sources: FileSource[]): void =>
    sources.forEach((source) => add.mutate({ ref: entity, source }))
  const { isOver, props } = useFileDrop(addAll)

  return (
    // The whole section takes drops, its title included; -m-2 p-2 gives the highlight room without moving anything.
    <section
      {...props}
      className={cn(
        'relative -m-2 flex flex-col gap-2 rounded-2xl p-2 transition-colors',
        isOver && 'bg-lime-soft'
      )}
    >
      <SectionLabel
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="xs" onClick={() => picker.current?.click()}>
                <Paperclip /> Додати файл
              </Button>
            </TooltipTrigger>
            <TooltipContent>Або перетягніть файли на цю секцію</TooltipContent>
          </Tooltip>
        }
      >
        Файли
      </SectionLabel>
      {/* empty:hidden — no files, no extra gap under the title. */}
      <div className="flex flex-col gap-1 empty:hidden">
        {fold.shown.map((f) => (
          <Item key={f.id} size="xs" className="group hover:bg-(--tile-hover)">
            <ItemMedia variant="image" className="size-8">
              {f.mime.startsWith('image/') ? (
                <img src={fileUrl(f.path)} alt="" />
              ) : (
                <Paperclip className="size-4" />
              )}
            </ItemMedia>
            <ItemContent className="min-w-0 gap-0">
              <ItemTitle
                className="w-full truncate text-caption font-normal"
                title={f.originalName}
              >
                {f.originalName}
              </ItemTitle>
              <ItemDescription className="text-meta">{fmtBytes(f.size)}</ItemDescription>
            </ItemContent>
            {/* Shown on hover and whenever keyboard focus is inside the row. */}
            <ItemActions className="gap-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <IconAction
                label="Відкрити"
                onClick={() => openFile(api.files.open(f.id), 'files:open')}
              >
                <ExternalLink />
              </IconAction>
              <IconAction
                label="Показати в папці"
                onClick={() => openFile(api.files.reveal(f.id), 'files:reveal')}
              >
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
      </div>
      <FoldButton fold={fold} />
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
      {/* An overlay, not a line in the flow: dragging over the section must not push the files and dates down. */}
      {isOver && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl border border-dashed border-ring bg-lime-soft/90 text-caption font-medium">
          Відпустіть, щоб додати
        </div>
      )}
    </section>
  )
}
