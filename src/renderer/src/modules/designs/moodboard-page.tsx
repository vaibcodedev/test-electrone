import { useEffect, useId, useMemo, useState, type ReactElement } from 'react'
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
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, ArrowUpRight, Check, Image, LayoutGrid, Plus, Trash2, X } from 'lucide-react'
import { moodboardInputSchema, type Design, type MoodboardDetails, type MoodboardPatch } from '@shared/domain/designs'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { useDebounced } from '@/hooks/use-debounced'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { EmptyState, Field, Page, PageBody, SearchInput } from '@/components/common/page'
import { InlineTitle } from '@/components/common/master-detail'
import { EditToggle, RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { VirtualGrid } from '@/components/common/virtual-list'
import { PinButtons } from '@/components/common/pin-buttons'
import { TagPicker } from '@/components/common/tags'
import { Confirm } from '@/components/common/confirm'
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
import { DesignMedia, DropOverlay, PickImagesButton, designTitle, useImportImages } from './shared'
import { isMediaFile } from './media'

const LIMITS = limitsOf(moodboardInputSchema)

function SortableDesign({ design, onRemove, onOpen }: { design: Design; onRemove: () => void; onOpen: () => void }): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: design.id })
  const title = designTitle(design)
  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative aspect-[4/3] cursor-grab gap-0 overflow-hidden py-0 active:cursor-grabbing',
        isDragging && 'z-10 opacity-80 shadow-2xl ring-2 ring-ring'
      )}
      {...attributes}
      {...listeners}
    >
      <DesignMedia path={design.imagePath} alt={title} className="size-full object-cover" />
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {/* A long title ends with «…» and never pushes the buttons off the tile. */}
        <Badge variant="ink" className="min-w-0 shrink justify-start">
          <span className="truncate" title={title}>
            {title}
          </span>
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
      <SearchInput value={search} onChange={setSearch} autoFocus />
      <ToggleGroup
        type="multiple"
        spacing={2}
        value={[...selected]}
        onValueChange={(v) => onSelectedChange(new Set(v))}
        className="h-[min(60vh,520px)] w-full flex-col flex-nowrap items-stretch"
        aria-label="Дизайни"
      >
        <VirtualGrid
          className="p-1"
          items={candidates}
          loading={list.isLoading}
          getKey={(d) => d.id}
          minColumnWidth={180}
          rowHeight={140}
          gap={8}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          onLoadMore={list.loadMore}
          empty={<EmptyState icon={Image} title="Нічого додати" hint="Усі дизайни вже в добірці або нічого не знайдено." />}
          renderItem={(d) => (
            <ToggleGroupItem
              value={d.id}
              aria-label={designTitle(d)}
              className="relative aspect-[4/3] h-auto w-full overflow-hidden rounded-xl bg-surface p-0 on:bg-surface on:ring-2 on:ring-ring on:ring-offset-2 on:ring-offset-card"
            >
              <DesignMedia path={d.imagePath} autoPlay={false} className="size-full object-cover" />
              {selected.has(d.id) && (
                <Badge variant="lime" className="absolute top-2 right-2 size-6 p-0">
                  <Check />
                </Badge>
              )}
            </ToggleGroupItem>
          )}
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
  const add = useApiMutation('moodboards', 'addDesigns', { successMessage: 'Додано в добірку' })
  const inBoard = useMemo(() => new Set(board.designs.map((d) => d.id)), [board.designs])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSelected(new Set())
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">Додати в «{board.title}»</DialogTitle>
          <DialogDescription>Позначте дизайни з галереї — вони стануть у кінець добірки.</DialogDescription>
        </DialogHeader>
        <DesignPicker inBoard={inBoard} selected={selected} onSelectedChange={setSelected} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
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
  const remove = useApiMutation('moodboards', 'remove', { successMessage: 'Добірку переміщено в кошик' })
  const removeDesign = useApiMutation('moodboards', 'removeDesign')
  const reorder = useApiMutation('moodboards', 'reorder')
  const addDesigns = useApiMutation('moodboards', 'addDesigns', { silent: true })
  const save = (patch: MoodboardPatch): void => update.mutate({ id: board.id, patch })
  const [title, setTitle] = useAutosave(board.title, (title) => title.trim() && save({ title }))
  const [description, setDescription] = useAutosave(board.description, (description) => save({ description }))
  const [pickerOpen, setPickerOpen] = useState(false)
  const mode = useRecordMode(board.id, 'moodboard')
  const descriptionId = useId()
  const close = (): void => void navigate('/designs')

  // Local order for instant feedback while dragging; follows server data otherwise.
  const [order, setOrder] = useState(board.designs.map((d) => d.id))
  useEffect(() => setOrder(board.designs.map((d) => d.id)), [board.designs])
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
    reorder.mutate({ moodboardId: board.id, designIds: next }, { onError: () => setOrder(board.designs.map((d) => d.id)) })
  }

  const { importSources, busy } = useImportImages(async (created) => {
    await addDesigns.mutateAsync({ moodboardId: board.id, designIds: created.map((d) => d.id) })
  })
  const { isOver, props } = useFileDrop((s) => void importSources(s), { accept: isMediaFile })
  usePasteFiles((s) => void importSources(s))
  const empty = order.length === 0

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
              <div className="flex-1" />
              <PinButtons entity={{ type: 'moodboard', id: board.id }} />
              <Tooltip>
                <Confirm
                  title="Видалити добірку?"
                  description="Самі дизайни залишаться в галереї."
                  confirmLabel="У кошик"
                  onConfirm={() => {
                    remove.mutate(board.id)
                    close()
                  }}
                >
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Видалити добірку">
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                </Confirm>
                <TooltipContent>Видалити добірку</TooltipContent>
              </Tooltip>
              <EditToggle mode={mode} onClose={close} />
            </div>
            <div className="flex items-end justify-between gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <InlineTitle value={title} onChange={setTitle} maxLength={LIMITS.title} className="text-title" />
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
                  description && <p className="text-body whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
                )}
                <TagPicker value={board.tags} onChange={(tagIds) => save({ tagIds })} />
              </div>
              {/* Quick actions: they fill the board and work in both modes. */}
              <div className="flex shrink-0 gap-2">
                <PickImagesButton onSources={(s) => void importSources(s)} label="Завантажити" disabled={busy} />
                {!empty && (
                  <Button variant="lime" onClick={() => setPickerOpen(true)}>
                    <Plus /> Додати дизайни
                  </Button>
                )}
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
              // The header hides its lime button while the board is empty: one action, one accent.
              action={
                <Button variant="lime" onClick={() => setPickerOpen(true)}>
                  <Plus /> Додати дизайни
                </Button>
              }
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
                        onRemove={() => removeDesign.mutate({ moodboardId: board.id, designId: id })}
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
        action={<Button onClick={() => navigate('/designs')}>До дизайнів</Button>}
      />
    )
  return <Board key={data.id} board={data} />
}
