import { useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Check, ImagePlus, LayoutGrid, Plus } from 'lucide-react'
import type { Design, DesignKind, FileSource, Moodboard } from '@shared/domain/designs'
import { api } from '@/lib/api'
import { invalidateAll, useApi, useApiMutation } from '@/lib/query'
import { fileUrl, toFileSources } from '@/lib/files'
import { hostOf } from '@/lib/format'
import { normalizeUrl } from '@/lib/open-url'
import { reportError } from '@/lib/error-reporting'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { clickableProps } from '@/lib/clickable'
import { MEDIA_ACCEPT, fillPalette, isVideoPath } from './media'

export const KIND_LABEL: Record<DesignKind, string> = {
  site: 'Сайт',
  landing: 'Лендинг',
  shop: 'Магазин',
  app: 'Застосунок',
  dashboard: 'Дашборд',
  other: 'Інше'
}

export function designTitle(d: Pick<Design, 'title' | 'sourceUrl'>): string {
  // A link saved without a scheme still names the design by its site.
  return d.title || (d.sourceUrl ? hostOf(normalizeUrl(d.sourceUrl)) : '') || 'Без назви'
}

/**
 * Imports images as designs (drop, paste, file picker, clipboard) and fills their palettes.
 * `onCreated` receives the created designs (e.g. to add them to a moodboard).
 */
export function useImportImages(onCreated?: (designs: Design[]) => Promise<void> | void) {
  const [busy, setBusy] = useState(false)
  const run = async (sources: FileSource[]): Promise<void> => {
    if (!sources.length) return
    setBusy(true)
    const created: Design[] = []
    try {
      for (const source of sources) {
        let design: Design
        try {
          design = await api.designs.importImage({ source })
        } catch (e) {
          toast.error((e as Error).message)
          continue
        }
        created.push(design)
        await fillPalette(design).catch((e) => reportError(e, 'designs:palette'))
      }
      if (created.length) {
        await onCreated?.(created)
        toast.success(created.length === 1 ? 'Картинку додано' : `Додано картинок: ${created.length}`)
      }
    } finally {
      invalidateAll()
      setBusy(false)
    }
  }
  return { importSources: run, busy }
}

/** Hidden file input triggered by a shadcn Button. */
export function PickImagesButton({
  onSources,
  label = 'Завантажити',
  variant = 'soft',
  disabled
}: {
  onSources: (sources: FileSource[]) => void
  label?: string
  variant?: 'soft' | 'lime'
  disabled?: boolean
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={async (e) => {
          if (e.target.files?.length) onSources(await toFileSources(e.target.files))
          e.target.value = ''
        }}
      />
      <Button variant={variant} disabled={disabled} onClick={() => ref.current?.click()}>
        <ImagePlus /> {label}
      </Button>
    </>
  )
}

/** Image or video thumbnail of a stored file. `autoPlay={false}` shows a video's first frame (pickers). */
export function DesignMedia({
  path,
  className,
  alt = '',
  autoPlay = true
}: {
  path: string | null
  className?: string
  alt?: string
  autoPlay?: boolean
}): ReactElement {
  if (!path) return <div className={cn('aspect-video bg-surface', className)} />
  if (isVideoPath(path)) {
    return <video src={fileUrl(path)} className={className} muted loop autoPlay={autoPlay} preload="metadata" playsInline />
  }
  return <img src={fileUrl(path)} alt={alt} loading="lazy" draggable={false} className={className} />
}

/** Cover mosaic of up to four images (shadcn Card). */
export function MoodboardTile({ board }: { board: Moodboard }): ReactElement {
  const navigate = useNavigate()
  const cells = [...board.previewPaths, null, null, null, null].slice(0, 4)
  return (
    <Card
      {...clickableProps(() => navigate(`/designs/boards/${board.id}`))}
      className="tile w-44 shrink-0 gap-1.5 p-1.5 text-left"
    >
      {board.itemCount === 0 ? (
        // Four blank cells looked like a broken preview: one quiet cell says the board is empty.
        <div className="grid aspect-[16/9] place-content-center justify-items-center gap-1 rounded-xl bg-card text-meta text-muted-foreground">
          <LayoutGrid className="size-4" />
          Порожня
        </div>
      ) : (
        <div className="grid aspect-[16/9] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl">
          {cells.map((p, i) =>
            p ? (
              <DesignMedia key={i} path={p} className="size-full object-cover" />
            ) : (
              <div key={i} className="size-full bg-card" style={board.color ? { background: `${board.color}33` } : undefined} />
            )
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5">
        <span className="truncate text-caption font-medium" title={board.title}>
          {board.title}
        </span>
        <span className="text-caption text-muted-foreground tabular-nums">{board.itemCount}</span>
      </div>
    </Card>
  )
}

/** Popover: add a design to one of the moodboards (or a new one). */
export function AddToMoodboard({ designId }: { designId: string }): ReactElement {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const { data: boards = [] } = useApi('moodboards', 'list', undefined, { enabled: open })
  const add = useApiMutation('moodboards', 'addDesigns')
  const create = useApiMutation('moodboards', 'create')
  // Failures are toasted by the mutations; the awaits below only stop on them.
  const addTo = async (board: Pick<Moodboard, 'id' | 'title'>): Promise<void> => {
    await add.mutateAsync({ moodboardId: board.id, designIds: [designId] })
    setAdded((s) => new Set(s).add(board.id))
    toast.success(`Додано в «${board.title}»`)
  }
  const addToNew = async (): Promise<void> => {
    if (create.isPending) return
    await addTo(await create.mutateAsync({ title: 'Нова добірка' }))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="soft" size="sm">
          <LayoutGrid /> У добірку
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-2xl p-0">
        <Command>
          <CommandList>
            <CommandEmpty>Добірок поки немає.</CommandEmpty>
            {boards.length > 0 && (
              <CommandGroup heading="Добірки">
                {boards.map((b) => (
                  <CommandItem key={b.id} value={`${b.title}-${b.id}`} onSelect={() => void addTo(b).catch(() => undefined)}>
                    <span className="size-2 rounded-full" style={{ background: b.color ?? 'var(--lime)' }} />
                    <span className="flex-1 truncate">{b.title}</span>
                    {added.has(b.id) ? (
                      <Check className="size-3.5" />
                    ) : (
                      <span className="text-meta text-muted-foreground">{b.itemCount}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="__new__" disabled={create.isPending} onSelect={() => void addToNew().catch(() => undefined)}>
                <Plus /> Нова добірка
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DropOverlay({ show, label = 'Відпустіть, щоб додати картинки' }: { show: boolean; label?: string }): ReactElement | null {
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-ring bg-lime-soft/80 backdrop-blur-sm">
      <Badge variant="ink" className="h-10 gap-2 px-5 text-lead [&>svg]:size-4">
        <ImagePlus className="text-ink-accent" /> {label}
      </Badge>
    </div>
  )
}
