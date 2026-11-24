import { useEffect, useMemo, useState } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import type { BoardColumn, BoardDetails, Card } from '@shared/domain/boards'
import { useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { CardTile } from './card-tile'
import { ColumnHeader } from './column-header'

type Layout = Record<string, string[]>

function buildLayout(details: BoardDetails): Layout {
  const layout: Layout = Object.fromEntries(details.columns.map((c) => [c.id, [] as string[]]))
  for (const card of [...details.cards].sort((a, b) => a.position - b.position)) {
    layout[card.columnId]?.push(card.id)
  }
  return layout
}

function SortableCard({ card, done, onOpen }: { card: Card; done: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <CardTile
      ref={setNodeRef}
      card={card}
      done={done}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
      }}
      {...attributes}
      {...listeners}
    />
  )
}

function QuickAddCard({ boardId, columnId }: { boardId: string; columnId: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const create = useApiMutation('cards', 'create')
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-1.5 rounded-xl px-2 text-[12.5px] text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <Plus className="size-3.5" /> Карточка
      </button>
    )
  }
  return (
    <textarea
      autoFocus
      rows={2}
      value={title}
      placeholder="Название карточки, Enter — сохранить"
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => {
        if (!title.trim()) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          if (title.trim()) create.mutate({ boardId, columnId, title: title.trim() })
          setTitle('')
        }
        if (e.key === 'Escape') {
          setTitle('')
          setOpen(false)
        }
      }}
      className="w-full resize-none rounded-2xl bg-card p-3 text-[13px] outline-none ring-1 ring-ring/40 placeholder:text-muted-foreground"
    />
  )
}

function Column({
  column,
  columns,
  cardIds,
  cardsById,
  onOpen
}: {
  column: BoardColumn
  columns: BoardColumn[]
  cardIds: string[]
  cardsById: Map<string, Card>
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  return (
    <section
      className={cn(
        'flex max-h-full w-[288px] shrink-0 flex-col rounded-3xl bg-surface p-2 transition-colors',
        isOver && 'bg-accent'
      )}
    >
      <ColumnHeader column={column} count={cardIds.length} columns={columns} />
      <div ref={setNodeRef} className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-0.5 py-1">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cardIds.map((id) => {
            const card = cardsById.get(id)
            return card ? (
              <SortableCard key={id} card={card} done={column.isDone} onOpen={() => onOpen(id)} />
            ) : null
          })}
        </SortableContext>
      </div>
      <div className="pt-1">
        <QuickAddCard boardId={column.boardId} columnId={column.id} />
      </div>
    </section>
  )
}

function AddColumn({ boardId }: { boardId: string }) {
  const [title, setTitle] = useState('')
  const add = useApiMutation('boards', 'addColumn')
  return (
    <form
      className="flex h-12 w-[260px] shrink-0 items-center gap-2 rounded-3xl border border-dashed border-input px-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        add.mutate({ boardId, input: { title: title.trim() } })
        setTitle('')
      }}
    >
      <Plus className="size-4 text-muted-foreground" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Новая колонка"
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </form>
  )
}

/**
 * Drag & drop kanban. Local layout is the source of truth during a drag (optimistic),
 * the server is told the final column + index on drop, then caches refresh.
 */
export function KanbanView({ details, onOpenCard }: { details: BoardDetails; onOpenCard: (id: string) => void }) {
  const [layout, setLayout] = useState<Layout>(() => buildLayout(details))
  const [activeId, setActiveId] = useState<string | null>(null)
  const move = useApiMutation('cards', 'move', { onError: () => setLayout(buildLayout(details)) })

  useEffect(() => {
    if (!activeId) setLayout(buildLayout(details))
  }, [details, activeId])

  const cardsById = useMemo(() => new Map(details.cards.map((c) => [c.id, c])), [details.cards])
  const doneColumns = useMemo(() => new Set(details.columns.filter((c) => c.isDone).map((c) => c.id)), [details.columns])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const containerOf = (id: string, l: Layout = layout): string | undefined =>
    id in l ? id : Object.keys(l).find((col) => l[col].includes(id))

  const onDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id))

  // Moving between columns happens live while hovering so the target column opens a gap.
  const onDragOver = ({ active, over }: DragOverEvent): void => {
    if (!over) return
    const activeIdStr = String(active.id)
    const overId = String(over.id)
    setLayout((l) => {
      const from = containerOf(activeIdStr, l)
      const to = containerOf(overId, l)
      if (!from || !to || from === to) return l
      const fromItems = l[from].filter((id) => id !== activeIdStr)
      const toItems = [...l[to]]
      const overIndex = toItems.indexOf(overId)
      const insertAt = overIndex >= 0 ? overIndex : toItems.length
      toItems.splice(insertAt, 0, activeIdStr)
      return { ...l, [from]: fromItems, [to]: toItems }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const cardId = String(active.id)
    setActiveId(null)
    if (!over) {
      setLayout(buildLayout(details))
      return
    }
    const column = containerOf(cardId)
    if (!column) return
    let items = layout[column]
    const overId = String(over.id)
    const oldIndex = items.indexOf(cardId)
    const newIndex = items.indexOf(overId)
    if (newIndex >= 0 && oldIndex !== newIndex) {
      items = arrayMove(items, oldIndex, newIndex)
      setLayout((l) => ({ ...l, [column]: items }))
    }
    const original = cardsById.get(cardId)
    const index = items.indexOf(cardId)
    const originalIndex = original ? buildLayout(details)[original.columnId]?.indexOf(cardId) : -1
    if (original && original.columnId === column && originalIndex === index) return
    move.mutate({ cardId, columnId: column, index })
  }

  const active = activeId ? cardsById.get(activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setLayout(buildLayout(details))
      }}
    >
      <div className="flex h-full min-h-0 items-start gap-3 overflow-x-auto px-8 pb-6">
        {details.columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            columns={details.columns}
            cardIds={layout[col.id] ?? []}
            cardsById={cardsById}
            onOpen={onOpenCard}
          />
        ))}
        <AddColumn boardId={details.board.id} />
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
        {active ? (
          <CardTile card={active} done={doneColumns.has(containerOf(active.id) ?? '')} overlay className="w-[272px]" />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
