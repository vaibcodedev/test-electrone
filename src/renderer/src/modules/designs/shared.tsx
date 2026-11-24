import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Check, ImagePlus, LayoutGrid, Plus } from 'lucide-react'
import type { Design, DesignKind, FileSource, Moodboard } from '@shared/domain/designs'
import { api } from '@/lib/api'
import { invalidateAll, useApi, useApiMutation } from '@/lib/query'
import { fileUrl, toFileSources } from '@/lib/files'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const KIND_LABEL: Record<DesignKind, string> = {
  site: 'Сайт',
  landing: 'Лендинг',
  shop: 'Магазин',
  app: 'Приложение',
  dashboard: 'Дашборд',
  other: 'Другое'
}

export function designTitle(d: Pick<Design, 'title' | 'sourceUrl'>): string {
  if (d.title) return d.title
  try {
    return new URL(d.sourceUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'Без названия'
  }
}

/**
 * Imports images as designs (drop, paste, file picker, clipboard).
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
        try {
          created.push(await api.designs.importImage({ source }))
        } catch (e) {
          toast.error((e as Error).message)
        }
      }
      if (created.length) {
        await onCreated?.(created)
        toast.success(created.length === 1 ? 'Картинка добавлена' : `Добавлено картинок: ${created.length}`)
      }
    } finally {
      invalidateAll()
      setBusy(false)
    }
  }
  return { importSources: run, busy }
}

/** Hidden <input type=file> + button. */
export function PickImagesButton({
  onSources,
  label = 'Загрузить',
  multiple = true,
  variant = 'soft'
}: {
  onSources: (sources: FileSource[]) => void
  label?: string
  multiple?: boolean
  variant?: 'soft' | 'lime' | 'default'
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/mp4,video/webm"
        multiple={multiple}
        hidden
        onChange={async (e) => {
          if (e.target.files?.length) onSources(await toFileSources(e.target.files))
          e.target.value = ''
        }}
      />
      <Button variant={variant} onClick={() => ref.current?.click()}>
        <ImagePlus /> {label}
      </Button>
    </>
  )
}

/** Image or video thumbnail of a stored file. */
export function DesignMedia({ path, className, alt = '' }: { path: string | null; className?: string; alt?: string }) {
  if (!path) return <div className={cn('aspect-video bg-surface', className)} />
  if (/\.(mp4|webm|mov)$/i.test(path)) {
    return <video src={fileUrl(path)} className={className} muted loop autoPlay playsInline />
  }
  return <img src={fileUrl(path)} alt={alt} loading="lazy" draggable={false} className={className} />
}

/** Cover mosaic of up to four images. */
export function MoodboardTile({ board }: { board: Moodboard }) {
  const navigate = useNavigate()
  const cells = [...board.previewPaths, null, null, null, null].slice(0, 4)
  return (
    <button
      type="button"
      onClick={() => navigate(`/designs/boards/${board.id}`)}
      className="group flex w-56 shrink-0 flex-col gap-2 rounded-3xl bg-surface p-2 text-left transition-colors hover:bg-accent"
    >
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl">
        {cells.map((p, i) =>
          p ? (
            <DesignMedia key={i} path={p} className="size-full object-cover" />
          ) : (
            <div key={i} className="size-full bg-card" style={board.color ? { background: `${board.color}33` } : undefined} />
          )
        )}
      </div>
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="truncate text-[13.5px] font-medium">{board.title}</span>
        <span className="text-[12px] text-muted-foreground tabular-nums">{board.itemCount}</span>
      </div>
    </button>
  )
}

/** Popover: add a design to one of the moodboards (or a new one). */
export function AddToMoodboard({ designId }: { designId: string }) {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const { data: boards = [] } = useApi('moodboards', 'list', undefined, { enabled: open })
  const add = useApiMutation('moodboards', 'addDesigns')
  const create = useApiMutation('moodboards', 'create')
  const addTo = async (board: Pick<Moodboard, 'id' | 'title'>): Promise<void> => {
    await add.mutateAsync({ moodboardId: board.id, designIds: [designId] })
    setAdded((s) => new Set(s).add(board.id))
    toast.success(`Добавлено в «${board.title}»`)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="soft" size="sm">
          <LayoutGrid /> В подборку
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-2xl p-1.5">
        <div className="max-h-64 overflow-y-auto">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => void addTo(b)}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] hover:bg-surface"
            >
              <span className="size-2 rounded-full" style={{ background: b.color ?? 'var(--lime)' }} />
              <span className="flex-1 truncate">{b.title}</span>
              {added.has(b.id) ? <Check className="size-3.5" /> : <span className="text-[11px] text-muted-foreground">{b.itemCount}</span>}
            </button>
          ))}
          {!boards.length && <p className="px-2.5 py-2 text-[12px] text-muted-foreground">Подборок пока нет.</p>}
        </div>
        <button
          type="button"
          onClick={async () => {
            const board = await create.mutateAsync({ title: 'Новая подборка' })
            await addTo(board)
          }}
          className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-border px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Plus className="size-3.5" /> Новая подборка
        </button>
      </PopoverContent>
    </Popover>
  )
}

export function DropOverlay({ show, label = 'Отпустите, чтобы добавить картинки' }: { show: boolean; label?: string }) {
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-ring bg-lime-soft/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[14px] text-ink-foreground">
        <ImagePlus className="size-4 text-lime" /> {label}
      </div>
    </div>
  )
}
