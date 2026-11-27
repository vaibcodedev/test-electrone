import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Check, ImagePlus, LayoutGrid, Plus, Star } from 'lucide-react'
import type { FileSource, Moodboard } from '@shared/domain/designs'
import { useApi, useApiMutation } from '@/lib/query'
import { fileUrl, thumbUrl, toFileSources } from '@/lib/files'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VideoPlayer } from '@/components/common/video-player'
import { Card } from '@/components/ui/card'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { clickableProps } from '@/lib/clickable'
import { MEDIA_ACCEPT, isVideoPath } from './media'
import { designCount } from './labels'
import { RecordMenu } from '@/features/record-menu/record-menu'
import { moodboardMenu } from './menu'

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

/**
 * Image or video of a stored file. A video plays by `play`: «hover» (tiles — the first frame at rest, plays while
 * its card is pointed at or focused, back to the start after), «controls» (the design dialog — the player, started
 * by its own ▶), «none» (pickers — the first frame), «auto» (previews — muted loop).
 */
export function DesignMedia({
  path,
  className,
  alt = '',
  play = 'hover',
  full = false
}: {
  path: string | null
  className?: string
  alt?: string
  play?: 'hover' | 'controls' | 'none' | 'auto'
  /** The original picture (the open design); tiles take the thumbnail. */
  full?: boolean
}): ReactElement {
  if (!path) return <div className={cn('aspect-video bg-surface', className)} />
  if (isVideoPath(path))
    return <DesignVideo src={fileUrl(path)} className={className} play={play} />
  return <DesignImage src={full ? fileUrl(path) : thumbUrl(path)} alt={alt} className={className} />
}

/** Hover play listens on the tile (the closest card), not the video: the frame around it counts as «on it». */
function DesignVideo({
  src,
  className,
  play
}: {
  src: string | undefined
  className?: string
  play: 'hover' | 'controls' | 'none' | 'auto'
}): ReactElement {
  if (play === 'controls') return <VideoPlayer src={src} className={className} />
  return <MutedVideo src={src} className={className} play={play} />
}

/** Tiles and pickers: muted, looping, no controls; «hover» plays while the card is pointed at or focused. */
function MutedVideo({
  src,
  className,
  play
}: {
  src: string | undefined
  className?: string
  play: 'hover' | 'none' | 'auto'
}): ReactElement {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (play !== 'hover' || !video) return
    const card = video.closest<HTMLElement>('[data-slot="card"]') ?? video.parentElement
    if (!card) return
    const start = (): void => void video.play().catch(() => undefined)
    const stop = (): void => {
      video.pause()
      video.currentTime = 0
    }
    card.addEventListener('pointerenter', start)
    card.addEventListener('pointerleave', stop)
    card.addEventListener('focusin', start)
    card.addEventListener('focusout', stop)
    return () => {
      card.removeEventListener('pointerenter', start)
      card.removeEventListener('pointerleave', stop)
      card.removeEventListener('focusin', start)
      card.removeEventListener('focusout', stop)
    }
  }, [play])
  return (
    <video
      ref={ref}
      // #t=0.1: the first frame shows at rest instead of a black box.
      src={play === 'auto' ? src : src && `${src}#t=0.1`}
      className={className}
      muted
      loop
      autoPlay={play === 'auto'}
      preload="metadata"
      playsInline
    />
  )
}

/**
 * A picture that is smaller than its box (a 16px favicon, a small icon) is shown at its own size in the middle
 * instead of being stretched by `object-cover` into a blurry blow-up.
 */
function DesignImage({
  src,
  alt,
  className
}: {
  src: string | undefined
  alt: string
  className?: string
}): ReactElement {
  const [small, setSmall] = useState(false)
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-small={small || undefined}
      onLoad={(e) => {
        const img = e.currentTarget
        setSmall(img.naturalWidth < img.clientWidth && img.naturalHeight < img.clientHeight)
      }}
      className={cn(className, 'data-small:object-scale-down data-small:object-center')}
    />
  )
}

/**
 * A moodboard tile: cover mosaic of up to four images (shadcn Card). An empty board is a compact tile with one
 * quiet cell — four blank cells looked like a broken preview. `layout="grid"` fills a grid cell (the «Усі
 * добірки» dialog); `onOpen` runs before navigating (closes that dialog).
 */
export function MoodboardTile({
  board,
  layout = 'strip',
  onOpen
}: {
  board: Moodboard
  layout?: 'strip' | 'grid'
  onOpen?: () => void
}): ReactElement {
  const navigate = useNavigate()
  const empty = board.itemCount === 0
  const cells = [...board.previewPaths, null, null, null, null].slice(0, 4)
  const tint = board.color ? { background: `${board.color}33` } : undefined
  const open = (): void => {
    onOpen?.()
    navigate(`/designs/boards/${board.id}`)
  }
  return (
    // Right click only: the strip's tiles are narrow, a «⋯» would cover the title.
    <RecordMenu asChild def={moodboardMenu} record={board} ctx={{ onOpen: open }}>
      <Card
        {...clickableProps(open)}
        className={cn(
          'tile gap-1.5 rounded-2xl p-1.5 text-left',
          // One width for every tile in the strip: a narrower empty tile cut its own title to «Но…».
          layout === 'grid' ? 'size-full' : 'w-44 shrink-0'
        )}
      >
        {empty ? (
          <div
            className="grid aspect-video place-items-center rounded-xl bg-foreground/5"
            style={tint}
          >
            <LayoutGrid className="size-4 text-muted-foreground" aria-hidden />
          </div>
        ) : (
          <div className="grid aspect-video grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl">
            {cells.map((p, i) =>
              p ? (
                <DesignMedia key={i} path={p} className="size-full object-cover" />
              ) : (
                <div key={i} className="size-full bg-card" style={tint} />
              )
            )}
          </div>
        )}
        {/* Title on its own line, the count under it: side by side the count took the title's room. */}
        <div className="flex min-w-0 flex-col px-1.5 pb-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {board.favorite && (
              <>
                <Star className="size-3.5 shrink-0 fill-current text-warn" aria-hidden />
                <span className="sr-only">В обраному</span>
              </>
            )}
            <span className="min-w-0 truncate text-body font-semibold" title={board.title}>
              {board.title}
            </span>
          </span>
          <span className="text-meta text-muted-foreground">
            {empty ? 'Порожня' : designCount(board.itemCount)}
          </span>
        </div>
      </Card>
    </RecordMenu>
  )
}

/** Last tile of the row when there are more boards than fit: «+N», opens «Усі добірки». */
export function MoreMoodboardsTile({
  count,
  onClick
}: {
  count: number
  onClick: () => void
}): ReactElement {
  return (
    <Card
      {...clickableProps(onClick)}
      aria-label={`Усі добірки: ще ${count}`}
      className="tile w-44 shrink-0 items-center justify-center gap-0.5 self-stretch rounded-2xl p-1.5"
    >
      <span className="text-lead font-semibold tabular-nums" aria-hidden>
        +{count}
      </span>
      <span className="text-caption text-muted-foreground" aria-hidden>
        Усі добірки
      </span>
    </Card>
  )
}

/**
 * The palette of a design as one strip of segments under its picture. Separate segments with gaps and an
 * inset hairline: a row of overlapping dots read as a switch, a filled bar would read as progress. No colours —
 * an empty slot of the same height, so tiles in a row stay level. Decorative: the tile itself is the button;
 * hex values with copying are in the design pane.
 */
export function PaletteStrip({
  colors,
  max = 6,
  className
}: {
  colors: string[]
  max?: number
  className?: string
}): ReactElement {
  return (
    <div data-slot="palette-strip" aria-hidden className={cn('flex h-2 gap-0.5', className)}>
      {colors.slice(0, max).map((c) => (
        <span
          key={c}
          className="flex-1 rounded-[3px] ring-1 ring-foreground/10 ring-inset"
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

/** Popover: add a design to one of the moodboards (or a new one); a board that has it already takes it out. */
export function AddToMoodboard({ designId }: { designId: string }): ReactElement {
  const [open, setOpen] = useState(false)
  // `contains` comes from the server: the tick survives reopening the pane, not just this session.
  const { data: boards = [], isLoading } = useApi(
    'moodboards',
    'list',
    { designId },
    { enabled: open }
  )
  const add = useApiMutation('moodboards', 'addDesigns')
  const takeOut = useApiMutation('moodboards', 'removeDesign')
  const create = useApiMutation('moodboards', 'create')
  // Failures are toasted by the mutations; the awaits below only stop on them.
  const addTo = async (board: Pick<Moodboard, 'id' | 'title'>): Promise<void> => {
    await add.mutateAsync({ moodboardId: board.id, designIds: [designId] })
    toast.success(`Дизайн додано в «${board.title}»`)
  }
  const toggle = async (board: Moodboard): Promise<void> => {
    if (add.isPending || takeOut.isPending) return
    if (!board.contains) return addTo(board)
    await takeOut.mutateAsync({ moodboardId: board.id, designId })
    toast.success(`Дизайн прибрано з «${board.title}»`)
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
            {/* Not CommandEmpty: cmdk shows it only when nothing matches, and «Нова добірка» below always does —
                the phrase never appeared. Hidden while loading, so it doesn't flash before the boards arrive. */}
            {!isLoading && boards.length === 0 && (
              <p
                data-slot="no-moodboards"
                className="px-2 py-1.5 text-caption text-muted-foreground"
              >
                Добірок поки немає.
              </p>
            )}
            {boards.length > 0 && (
              <CommandGroup heading="Добірки">
                {boards.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`${b.title}-${b.id}`}
                    onSelect={() => void toggle(b).catch(() => undefined)}
                  >
                    {/* One marker slot: a colour dot and the board icon keep the titles on one line. A board without
                        its own colour gets the neutral icon, not a row of lime dots. */}
                    <span className="grid size-4 shrink-0 place-items-center">
                      {b.color ? (
                        <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                      ) : (
                        <LayoutGrid className="size-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="flex-1 truncate">{b.title}</span>
                    {b.contains ? (
                      <>
                        <Check className="size-3.5" aria-hidden />
                        <span className="sr-only">(вже в добірці)</span>
                      </>
                    ) : (
                      <span className="text-meta text-muted-foreground">{b.itemCount}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {/* cmdk shows a separator whenever the search is empty: with no boards it hung alone on top. */}
            {boards.length > 0 && <CommandSeparator />}
            <CommandGroup>
              <CommandItem
                value="__new__"
                disabled={create.isPending}
                onSelect={() => void addToNew().catch(() => undefined)}
              >
                <Plus /> Нова добірка
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DropOverlay({
  show,
  label = 'Відпустіть, щоб додати картинки'
}: {
  show: boolean
  label?: string
}): ReactElement | null {
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-ring bg-lime-soft/80 backdrop-blur-sm">
      <Badge variant="ink" className="h-10 gap-2 px-5 text-lead [&>svg]:size-4">
        <ImagePlus className="text-ink-accent" /> {label}
      </Badge>
    </div>
  )
}
