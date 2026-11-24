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
import type { Design, MoodboardDetails, MoodboardPatch } from '@shared/domain/designs'
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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DesignMedia, DropOverlay, PickImagesButton, designTitle, useImportImages } from './shared'

function SortableDesign({ design, onRemove, onOpen }: { design: Design; onRemove: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: design.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative aspect-[4/3] cursor-grab overflow-hidden rounded-2xl bg-surface active:cursor-grabbing',
        isDragging && 'z-10 opacity-80 shadow-2xl ring-2 ring-ring'
      )}
      {...attributes}
      {...listeners}
    >
      <DesignMedia path={design.imagePath} alt={designTitle(design)} className="size-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="truncate text-[12px] font-medium text-white">{designTitle(design)}</span>
        <span className="flex gap-1">
          <button
            type="button"
            title="Открыть"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onOpen}
            className="grid size-7 place-items-center rounded-full bg-white/90 text-black hover:bg-white"
          >
            <ArrowUpRight className="size-3.5" />
          </button>
          <button
            type="button"
            title="Убрать из подборки"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            className="grid size-7 place-items-center rounded-full bg-white/90 text-black hover:bg-white"
          >
            <X className="size-3.5" />
          </button>
        </span>
      </div>
    </div>
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
  const add = useApiMutation('moodboards', 'addDesigns', { successMessage: 'Добавлено в подборку' })
  const inBoard = useMemo(() => new Set(board.designs.map((d) => d.id)), [board.designs])
  const candidates = all.filter((d) => !inBoard.has(d.id))

  const toggle = (id: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSelected(new Set())
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-[880px]">
        <DialogTitle className="font-display text-xl">Добавить в «{board.title}»</DialogTitle>
        <SearchInput value={search} onChange={setSearch} autoFocus />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">Все дизайны уже в подборке или ничего не найдено.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {candidates.map((d) => {
                const on = selected.has(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggle(d.id)}
                    className={cn(
                      'relative aspect-[4/3] overflow-hidden rounded-xl bg-surface',
                      on && 'ring-2 ring-ring ring-offset-2 ring-offset-card'
                    )}
                  >
                    <DesignMedia path={d.imagePath} className="size-full object-cover" />
                    {on && (
                      <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-lime text-lime-foreground">
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
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
            Добавить {selected.size || ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Board({ board }: { board: MoodboardDetails }) {
  const navigate = useNavigate()
  const update = useApiMutation('moodboards', 'update')
  const remove = useApiMutation('moodboards', 'remove', { successMessage: 'Подборка в корзине' })
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
        <DropOverlay show={isOver} label="Отпустите, чтобы добавить в подборку" />
        <header className="flex flex-col gap-3 px-8 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/designs')}>
              <ArrowLeft /> Дизайны
            </Button>
            <div className="flex-1" />
            <PinButtons entity={{ type: 'moodboard', id: board.id }} />
            <Confirm
              title="Удалить подборку?"
              description="Сами дизайны останутся в галерее."
              confirmLabel="В корзину"
              onConfirm={() => {
                remove.mutate(board.id)
                navigate('/designs')
              }}
            >
              <Button variant="ghost" size="icon-sm" title="Удалить подборку">
                <Trash2 />
              </Button>
            </Confirm>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0 flex-1">
              <InlineTitle value={title} onChange={setTitle} className="text-title" />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="О чём эта подборка: стиль, настроение, для какого проекта"
                className="mt-2 w-full bg-transparent text-[13px] text-muted-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <TagPicker value={board.tags} onChange={(tagIds) => save({ tagIds })} className="mt-3" />
            </div>
            <div className="flex shrink-0 gap-2">
              <PickImagesButton onSources={(s) => void importSources(s)} label="Загрузить" />
              <Button variant="lime" disabled={busy} onClick={() => setPickerOpen(true)}>
                <Plus /> Добавить дизайны
              </Button>
            </div>
          </div>
        </header>
        <PageBody>
          {order.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Подборка пуста"
              hint="Добавьте дизайны из галереи или перетащите картинки прямо сюда."
              action={
                <Button variant="lime" onClick={() => setPickerOpen(true)}>
                  <Image /> Выбрать из галереи
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
        title="Подборка не найдена"
        hint="Возможно, она в корзине."
        action={<Button onClick={() => navigate('/designs')}>К дизайнам</Button>}
      />
    )
  return <Board key={data.id} board={data} />
}
