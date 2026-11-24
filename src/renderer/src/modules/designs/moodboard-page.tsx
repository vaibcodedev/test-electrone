import { useEffect, useMemo, useState } from 'react'
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
import { useApi, useApiMutation } from '@/lib/query'
import { isImageFile } from '@/lib/files'
import { useAutosave } from '@/hooks/use-autosave'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { EmptyState, Page, PageBody, SearchInput } from '@/components/common/page'
import { InlineTitle } from '@/components/common/master-detail'
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
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DesignMedia, DropOverlay, PickImagesButton, designTitle, useImportImages } from './shared'

const LIMITS = limitsOf(moodboardInputSchema)

function SortableDesign({ design, onRemove, onOpen }: { design: Design; onRemove: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: design.id })
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
      <DesignMedia path={design.imagePath} alt={designTitle(design)} className="size-full object-cover" />
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Badge variant="ink" className="max-w-full truncate">
          {designTitle(design)}
        </Badge>
        <span className="flex gap-1">
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

/** Multi-select picker of designs not yet in the board. */
function AddDesignsDialog({
  open,
  onOpenChange,
  board
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: MoodboardDetails
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { data: all = [] } = useApi('designs', 'list', { search: search || undefined }, { enabled: open })
  const add = useApiMutation('moodboards', 'addDesigns', { successMessage: 'Додано в добірку' })
  const inBoard = useMemo(() => new Set(board.designs.map((d) => d.id)), [board.designs])
  const candidates = all.filter((d) => !inBoard.has(d.id))

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
        <SearchInput value={search} onChange={setSearch} autoFocus />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <EmptyState icon={Image} title="Нічого додати" hint="Усі дизайни вже в добірці або нічого не знайдено." />
          ) : (
            <ToggleGroup
              type="multiple"
              spacing={2}
              value={[...selected]}
              onValueChange={(v) => setSelected(new Set(v))}
              className="grid w-full grid-cols-4 p-1"
              aria-label="Дизайни"
            >
              {candidates.map((d) => {
                const on = selected.has(d.id)
                return (
                  <ToggleGroupItem
                    key={d.id}
                    value={d.id}
                    aria-label={designTitle(d)}
                    className="relative aspect-[4/3] h-auto w-full overflow-hidden rounded-xl bg-surface p-0 on:bg-surface on:ring-2 on:ring-ring on:ring-offset-2 on:ring-offset-card"
                  >
                    <DesignMedia path={d.imagePath} className="size-full object-cover" />
                    {on && (
                      <Badge variant="lime" className="absolute top-2 right-2 size-6 p-0">
                        <Check />
                      </Badge>
                    )}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button
            variant="lime"
            disabled={!selected.size || add.isPending}
            onClick={async () => {
              await add.mutateAsync({ moodboardId: board.id, designIds: [...selected] })
              setSelected(new Set())
              onOpenChange(false)
            }}
          >
            Додати {selected.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Board({ board }: { board: MoodboardDetails }) {
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
    reorder.mutate({ moodboardId: board.id, designIds: next })
  }

  const { importSources, busy } = useImportImages(async (created) => {
    await addDesigns.mutateAsync({ moodboardId: board.id, designIds: created.map((d) => d.id) })
  })
  const { isOver, props } = useFileDrop((s) => void importSources(s), { accept: (f) => isImageFile(f) || f.type.startsWith('video/') })
  usePasteFiles((s) => void importSources(s))

  return (
    <Page>
      <div {...props} className="relative flex min-h-0 flex-1 flex-col">
        <DropOverlay show={isOver} label="Відпустіть, щоб додати в добірку" />
        <header className="flex flex-col gap-3 px-8 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/designs')}>
              <ArrowLeft /> Дизайни
            </Button>
            <div className="flex-1" />
            <PinButtons entity={{ type: 'moodboard', id: board.id }} />
            <Confirm
              title="Видалити добірку?"
              description="Самі дизайни залишаться в галереї."
              confirmLabel="У кошик"
              onConfirm={() => {
                remove.mutate(board.id)
                navigate('/designs')
              }}
            >
              <Button variant="ghost" size="icon-sm" aria-label="Видалити добірку">
                <Trash2 />
              </Button>
            </Confirm>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0 flex-1">
              <InlineTitle value={title} onChange={setTitle} maxLength={LIMITS.title} className="text-title" />
              <Input
                value={description}
                maxLength={LIMITS.description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Про що ця добірка: стиль, настрій, для якого проєкту"
                aria-label="Опис добірки"
                className="mt-2 -mx-2 h-8 w-[calc(100%+1rem)] rounded-lg border-0 bg-transparent px-2 text-body text-muted-foreground transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-0"
              />
              <TagPicker value={board.tags} onChange={(tagIds) => save({ tagIds })} className="mt-3" />
            </div>
            <div className="flex shrink-0 gap-2">
              <PickImagesButton onSources={(s) => void importSources(s)} label="Завантажити" />
              <Button variant="lime" disabled={busy} onClick={() => setPickerOpen(true)}>
                <Plus /> Додати дизайни
              </Button>
            </div>
          </div>
        </header>
        <PageBody>
          {order.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Добірка порожня"
              hint="Додайте дизайни з галереї або перетягніть картинки просто сюди."
              action={
                <Button variant="lime" onClick={() => setPickerOpen(true)}>
                  <Image /> Вибрати з галереї
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

export function MoodboardPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('moodboards', 'details', id)
  if (isLoading) return null
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
