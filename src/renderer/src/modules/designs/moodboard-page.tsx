import { useId, useMemo, useState, type ReactElement } from 'react'
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
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { EmptyState, Field, Page, PageBody, SearchInput } from '@/components/common/page'
import { InlineTitle, RecordActions } from '@/components/common/master-detail'
import { RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { VirtualGrid } from '@/components/common/virtual-list'
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
import { useImportImages } from './use-import-images'
import { isMediaFile } from './media'

const LIMITS = limitsOf(moodboardInputSchema)

function SortableDesign({
  design,
  onRemove,
  onOpen
}: {
  design: Design
  onRemove: () => void
  onOpen: () => void
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: design.id
  })
  const title = designTitle(design)
  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // The surface frame of the gallery tiles: a dark screenshot doesn't melt into the page.
        'group relative aspect-4/3 cursor-grab gap-0 overflow-hidden bg-surface p-1.5 active:cursor-grabbing',
        isDragging && 'z-10 opacity-80 shadow-2xl ring-2 ring-ring'
      )}
      {...attributes}
      {...listeners}
    >
      <DesignMedia
        path={design.imagePath}
        alt={title}
        className="size-full rounded-xl object-cover"
      />
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
                onClick={onOpen}
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
                onClick={onRemove}
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
                className="h-auto w-full flex-col items-stretch gap-1.5 rounded-2xl p-1 text-caption font-normal hover:bg-foreground/6 on:bg-transparent on:ring-2 on:ring-ring on:ring-offset-2 on:ring-offset-card"
              >
                <span className="relative block aspect-4/3 overflow-hidden rounded-xl bg-surface">
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
                <span className="truncate px-1 text-left" title={title}>
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
  usePasteFiles((s) => void importSources(s))
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
          <header className="flex flex-col gap-3 px-8 pt-6 pb-5">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                <ArrowLeft /> Дизайни
              </Button>
              {/* The record header of every editor: pin, trash (restorable, so no question), edit, ✕ — Esc closes. */}
              <RecordActions
                className="flex-1"
                entity={{ type: 'moodboard', id: board.id }}
                mode={mode}
                onDelete={() => {
                  remove.mutate(board.id)
                  close()
                }}
                onClose={close}
              />
            </div>
            <div className="flex items-end justify-between gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
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
                {/* A link made from a bookmark or a design shows here too (reading without links: the title and «Зв’язати»). */}
                <div className="flex max-w-md flex-col gap-6">
                  <LinksPanel entity={{ type: 'moodboard', id: board.id }} />
                  <MentionsPanel entity={{ type: 'moodboard', id: board.id }} />
                </div>
              </div>
              {/* Quick actions: they fill the board and work in both modes. The slot makes N press «Додати
                  дизайни»; it sits here, not on the whole header, so N never finds «Зберегти» while editing. */}
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
            </div>
          </header>
        </RecordMode>
        <PageBody>
          {empty ? (
            <EmptyState
              icon={LayoutGrid}
              title="Добірка порожня"
              hint="Додайте дизайни з галереї або перетягніть картинки просто сюди."
              cta={{ label: 'Додати дизайни', icon: Plus, onClick: () => setPickerOpen(true) }}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                  {order.map((id) => {
                    const d = byId.get(id)
                    if (!d) return null
                    return (
                      <SortableDesign
                        key={id}
                        design={d}
                        onOpen={() => navigate(`/designs?open=${id}`)}
                        onRemove={() => removeFromBoard(id)}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </PageBody>
      </div>
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
