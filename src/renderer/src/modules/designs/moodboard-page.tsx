import { useId, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { ArrowLeft, ArrowUpRight, Check, Image, LayoutGrid, Plus, X } from 'lucide-react'
import {
  moodboardInputSchema,
  type Design,
  type MoodboardDetails,
  type MoodboardPatch
} from '@shared/domain/designs'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { useDebounced } from '@/hooks/use-debounced'
import { useFileDrop, usePastedFiles } from '@/hooks/use-file-drop'
import { EmptyState, Field, Page, PageBody, SearchInput } from '@/components/common/page'
import { InlineTitle, RecordActions } from '@/components/common/master-detail'
import { RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { VirtualGrid } from '@/components/common/virtual-list'
import { useOpenParam } from '@/components/common/master-detail'
import { TagPicker } from '@/components/common/tags'
import { LinksPanel } from '@/components/common/links-panel'
import { MentionsPanel } from '@/components/common/mentions-panel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DesignMedia, DropOverlay, PickImagesButton } from './shared'
import { designCount, designTitle } from './labels'
import { DesignDialog } from './design-dialog'
import { useImportPreview } from './use-import-preview'
import { useWrapGrid } from './use-wrap-grid'
import { useImportImages } from './use-import-images'
import { isMediaFile } from './media'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { useFavorites } from '@/hooks/use-favorites'

const LIMITS = limitsOf(moodboardInputSchema)

function SortableDesign({
  design,
  onRemove,
  onOpen
}: {
  design: Design
  onRemove: () => void
  /** A plain click opens the design; a drag (6px and more) reorders and opens nothing. */
  onOpen: () => void
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: design.id
  })
  const title = designTitle(design)
  const fav = useFavorites()
  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // The surface frame of the gallery tiles: a dark screenshot doesn't melt into the page.
        'group relative aspect-4/3 cursor-pointer gap-0 overflow-hidden rounded-2xl bg-surface p-1.5 active:cursor-grabbing',
        isDragging && 'z-10 opacity-80 shadow-2xl ring-2 ring-ring'
      )}
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <DesignMedia
        path={design.imagePath}
        alt={title}
        className="size-full rounded-xl object-cover"
      />
      {/* ★ only marks here: the order of a moodboard is yours. */}
      {fav.has({ type: 'design', id: design.id }) && (
        <Badge variant="soft" className="absolute top-3 left-3 bg-card p-1 shadow-sm">
          <FavoriteMark entity={{ type: 'design', id: design.id }} />
        </Badge>
      )}
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {/* A long title ends with «…» and never pushes the buttons off the tile. */}
        <Badge variant="ink" truncate>
          {title}
        </Badge>
        <span className="flex shrink-0 gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="soft"
                size="icon-xs"
                aria-label="Відкрити"
                className="bg-card hover:bg-card"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen()
                }}
              >
                <ArrowUpRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Відкрити</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="soft"
                size="icon-xs"
                aria-label="Прибрати з добірки"
                className="bg-card hover:bg-card hover:text-destructive"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Прибрати з добірки</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </Card>
  )
}

/** Paged, virtualized gallery inside the picker; mounted only while the dialog is open. */
function DesignPicker({
  inBoard,
  selected,
  onSelectedChange
}: {
  inBoard: Set<string>
  selected: Set<string>
  onSelectedChange: (selected: Set<string>) => void
}): ReactElement {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('designs', 'list', { search: q || undefined }, 60)
  const candidates = list.items.filter((d) => !inBoard.has(d.id))
  return (
    <>
      {/* Full width: the default w-72 sat alone in an 880 px dialog. */}
      <SearchInput value={search} onChange={setSearch} className="w-full" autoFocus />
      <ToggleGroup
        type="multiple"
        spacing={2}
        value={[...selected]}
        onValueChange={(v) => onSelectedChange(new Set(v))}
        // Grows with the designs up to the cap: six of them no longer leave half the dialog blank.
        className="max-h-[min(60vh,520px)] min-h-44 w-full flex-col flex-nowrap items-stretch"
        aria-label="Дизайни"
      >
        <VirtualGrid
          className="p-1"
          items={candidates}
          loading={list.isLoading}
          getKey={(d) => d.id}
          minColumnWidth={180}
          rowHeight={170}
          gap={8}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          onLoadMore={list.loadMore}
          empty={
            <EmptyState
              icon={Image}
              title="Нічого додати"
              hint="Усі дизайни вже в добірці або нічого не знайдено."
            />
          }
          renderItem={(d) => {
            const title = designTitle(d)
            return (
              // The title under the thumbnail: similar screenshots are told apart by it.
              <ToggleGroupItem
                value={d.id}
                aria-label={title}
                // The gallery's tile (surface frame, title inside, inset outline when picked): the same card in both places.
                className="tile h-auto w-full flex-col items-stretch gap-1.5 rounded-2xl bg-surface p-1.5 pb-2 text-caption font-normal on:bg-accent on:outline-2 on:-outline-offset-2 on:outline-ring"
              >
                <span className="relative block aspect-4/3 overflow-hidden rounded-xl bg-card">
                  <DesignMedia
                    path={d.imagePath}
                    autoPlay={false}
                    className="size-full object-cover"
                  />
                  {selected.has(d.id) && (
                    <Badge variant="lime" className="absolute top-2 right-2 size-6 p-0">
                      <Check />
                    </Badge>
                  )}
                </span>
                <span className="truncate px-1.5 text-left text-body font-medium" title={title}>
                  {title}
                </span>
              </ToggleGroupItem>
            )
          }}
        />
      </ToggleGroup>
    </>
  )
}

/** Multi-select picker of designs not yet in the board. */
function AddDesignsDialog({
  open,
  onOpenChange,
  board
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: MoodboardDetails
}): ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const add = useApiMutation('moodboards', 'addDesigns')
  const inBoard = useMemo(() => new Set(board.designs.map((d) => d.id)), [board.designs])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSelected(new Set())
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-220">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">Додати в «{board.title}»</DialogTitle>
          <DialogDescription>
            Позначте дизайни з галереї — вони стануть у кінець добірки.
          </DialogDescription>
        </DialogHeader>
        <DesignPicker inBoard={inBoard} selected={selected} onSelectedChange={setSelected} />
        <DialogFooter>
          {/* Why «Додати» is inactive (DS §5). */}
          {!selected.size && (
            <span className="mr-auto self-center text-caption text-muted-foreground">
              Позначте дизайни
            </span>
          )}
          <Button variant="soft" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button
            variant="lime"
            disabled={!selected.size || add.isPending}
            onClick={() =>
              add.mutate(
                { moodboardId: board.id, designIds: [...selected] },
                {
                  onSuccess: () => {
                    const n = selected.size
                    toast.success(n === 1 ? 'Дизайн додано в добірку' : `Додано ${designCount(n)}`)
                    setSelected(new Set())
                    onOpenChange(false)
                  }
                }
              )
            }
          >
            Додати {selected.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Board({ board }: { board: MoodboardDetails }): ReactElement | null {
  const navigate = useNavigate()
  const update = useApiMutation('moodboards', 'update')
  const remove = useApiMutation('moodboards', 'remove', {
    successMessage: 'Добірку переміщено в кошик — дизайни залишилися в галереї'
  })
  const removeDesign = useApiMutation('moodboards', 'removeDesign')
  const reorder = useApiMutation('moodboards', 'reorder')
  const addDesigns = useApiMutation('moodboards', 'addDesigns', { silent: true })
  const save = (patch: MoodboardPatch): void => update.mutate({ id: board.id, patch })
  const [title, setTitle] = useAutosave(board.title, (title) => title.trim() && save({ title }))
  const [description, setDescription] = useAutosave(board.description, (description) =>
    save({ description })
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const mode = useRecordMode(board.id, 'moodboard')
  const descriptionId = useId()
  const close = (): void => void navigate('/designs')
  // A design opens over the board (the gallery's dialog), ?open= like everywhere; the board stays underneath.
  const [openDesign, setOpenDesign] = useOpenParam()
  // A drag ends with a click on the same tile: it must not open the design it just moved.
  const dragged = useRef(false)
  const { gridRef, headerRef, asideRef, gridStyle, headerStyle, asideStyle, mainStyle } =
    useWrapGrid()

  // Local order for instant feedback while dragging; follows server data otherwise (synced during render).
  const [order, setOrder] = useState(board.designs.map((d) => d.id))
  const [synced, setSynced] = useState(board.designs)
  if (synced !== board.designs) {
    setSynced(board.designs)
    setOrder(board.designs.map((d) => d.id))
  }
  const byId = useMemo(() => new Map(board.designs.map((d) => [d.id, d])), [board.designs])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)))
    setOrder(next)
    // The server refused: put the tiles back where they really are.
    reorder.mutate(
      { moodboardId: board.id, designIds: next },
      { onError: () => setOrder(board.designs.map((d) => d.id)) }
    )
  }

  const { importSources, busy } = useImportImages(async (created) => {
    await addDesigns.mutateAsync({ moodboardId: board.id, designIds: created.map((d) => d.id) })
  })
  const { isOver, props } = useFileDrop((s) => void importSources(s), { accept: isMediaFile })
  // Ctrl+V asks first, with the picture shown (like «З буфера» in the gallery); a drop is instant.
  const preview = useImportPreview(importSources, 'Додати в добірку')
  usePastedFiles((files) => void preview.fromFiles(files))
  const empty = order.length === 0

  /** The ✕ sits next to «Відкрити» and works while reading: the toast can undo it, back to the same place. */
  const removeFromBoard = (id: string): void => {
    const before = order
    removeDesign.mutate(
      { moodboardId: board.id, designId: id },
      {
        onSuccess: () =>
          toast.success('Дизайн прибрано з добірки', {
            action: {
              label: 'Скасувати',
              onClick: () =>
                void addDesigns
                  .mutateAsync({ moodboardId: board.id, designIds: [id] })
                  .then(() => reorder.mutate({ moodboardId: board.id, designIds: before }))
                  .catch((e) => toast.error((e as Error).message))
            }
          })
      }
    )
  }

  return (
    <Page>
      <div {...props} className="relative flex min-h-0 flex-1 flex-col">
        <DropOverlay show={isOver} label="Відпустіть, щоб додати в добірку" />
        <RecordMode mode={mode}>
          {/* Fixed: the way back, the board's actions and adding designs. Everything else scrolls with the grid —
              a long list of links used to grow this header until the grid had no room and nothing scrolled. */}
          <div className="flex items-center gap-2 px-8 pt-6 pb-3">
            {/* The same exit as ✕: asks about unsaved changes, an untouched new board isn't kept. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (mode.confirmClose ? mode.confirmClose(close) : close())}
            >
              <ArrowLeft /> Дизайни
            </Button>
            {/* The record header of every editor: pin, trash (restorable, so no question), edit, ✕ — Esc closes. */}
            <RecordActions
              className="flex-1"
              entity={{ type: 'moodboard', id: board.id }}
              mode={mode}
              extra={
                // Quick actions: they fill the board and work in both modes. The slot makes N press «Додати
                // дизайни»; it sits here, not on the whole header, so N never finds «Зберегти» while editing.
                <div data-slot="page-header" className="flex shrink-0 gap-2">
                  <PickImagesButton
                    onSources={(s) => void importSources(s)}
                    label="Завантажити"
                    disabled={busy}
                  />
                  <Button variant="lime" onClick={() => setPickerOpen(true)}>
                    <Plus /> Додати дизайни
                  </Button>
                </div>
              }
              onDelete={() => {
                remove.mutate(board.id)
                close()
              }}
              onClose={close}
            />
          </div>
          <PageBody>
            {/* One grid for the header, the aside and the designs: the designs flow around the aside (useWrapGrid). */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => {
                dragged.current = true
              }}
              onDragEnd={(e) => {
                onDragEnd(e)
                setTimeout(() => {
                  dragged.current = false
                })
              }}
              onDragCancel={() => {
                dragged.current = false
              }}
            >
              <div
                ref={gridRef}
                className="grid grid-flow-row-dense items-start gap-3 pt-2"
                style={gridStyle}
              >
                <header
                  ref={headerRef}
                  className="flex min-w-0 flex-col gap-3 pr-4 pb-3"
                  style={headerStyle}
                >
                  <InlineTitle
                    value={title}
                    onChange={setTitle}
                    maxLength={LIMITS.title}
                    className="text-title"
                  />
                  {mode.editing ? (
                    <Field label="Опис" htmlFor={descriptionId}>
                      <Textarea
                        id={descriptionId}
                        value={description}
                        maxLength={LIMITS.description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Напр.: темні дашборди для CRM"
                        className="min-h-0"
                      />
                    </Field>
                  ) : (
                    description && (
                      <p className="text-body whitespace-pre-line text-muted-foreground wrap-anywhere">
                        {description}
                      </p>
                    )
                  )}
                  <TagPicker value={board.tags} onChange={(tagIds) => save({ tagIds })} />
                </header>
                {/* The record aside's column: «Зв’язати» next to its label; long lists fold to five. A link made
                    from a bookmark or a design shows here too. */}
                <aside
                  ref={asideRef}
                  className="flex min-w-0 flex-col gap-6 px-1 pb-3"
                  style={asideStyle}
                >
                  <LinksPanel entity={{ type: 'moodboard', id: board.id }} />
                  <MentionsPanel entity={{ type: 'moodboard', id: board.id }} />
                </aside>
                {empty ? (
                  <div style={mainStyle}>
                    <EmptyState
                      icon={LayoutGrid}
                      title="Добірка порожня"
                      hint="Додайте дизайни з галереї або перетягніть картинки просто сюди."
                      cta={{
                        label: 'Додати дизайни',
                        icon: Plus,
                        onClick: () => setPickerOpen(true)
                      }}
                    />
                  </div>
                ) : (
                  <SortableContext items={order} strategy={rectSortingStrategy}>
                    {order.map((id) => {
                      const d = byId.get(id)
                      if (!d) return null
                      return (
                        <SortableDesign
                          key={id}
                          design={d}
                          onOpen={() => {
                            if (!dragged.current) setOpenDesign(id)
                          }}
                          onRemove={() => removeFromBoard(id)}
                        />
                      )
                    })}
                  </SortableContext>
                )}
              </div>
            </DndContext>
          </PageBody>
        </RecordMode>
      </div>
      {preview.dialog}
      <DesignDialog
        id={openDesign}
        ids={order}
        onOpen={setOpenDesign}
        onClose={() => setOpenDesign(null)}
      />
      <AddDesignsDialog open={pickerOpen} onOpenChange={setPickerOpen} board={board} />
    </Page>
  )
}

export function MoodboardPage(): ReactElement {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('moodboards', 'details', id)
  if (isLoading) return <PageSkeleton kind="grid" />
  if (!data)
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Добірку не знайдено"
        hint="Можливо, вона в кошику."
        cta={{ label: 'До дизайнів', icon: ArrowLeft, onClick: () => navigate('/designs') }}
      />
    )
  return <Board key={data.id} board={data} />
}
