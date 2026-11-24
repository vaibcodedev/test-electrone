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
import { MoveRight, Plus, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import type { BoardColumn, BoardDetails, Card } from '@shared/domain/boards'
import { useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card as UiCard } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
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

function SortableCard({
  card,
  done,
  onOpen,
  columns
}: {
  card: Card
  done: boolean
  onOpen: () => void
  columns: BoardColumn[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const move = useApiMutation('cards', 'move')
  const remove = useApiMutation('cards', 'remove', { successMessage: 'Картку переміщено в кошик' })
  // Right-click menu: the quick way to move or delete without opening the card.
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onOpen}>
          <SquareArrowOutUpRight /> Відкрити
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <MoveRight /> Перемістити в…
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {columns.map((c) => (
              <ContextMenuItem
                key={c.id}
                disabled={c.id === card.columnId}
                onSelect={() => move.mutate({ cardId: card.id, columnId: c.id, index: 0 })}
              >
                {c.title}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => remove.mutate(card.id)}>
          <Trash2 /> У кошик
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function QuickAddCard({ boardId, columnId }: { boardId: string; columnId: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const create = useApiMutation('cards', 'create')
  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full justify-start rounded-xl px-2 text-caption font-normal text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <Plus /> Картка
      </Button>
    )
  }
  return (
    <Textarea
      autoFocus
      rows={2}
      value={title}
      maxLength={300}
      placeholder="Назва картки, Enter — зберегти"
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
      aria-label="Назва нової картки"
      className="min-h-16 rounded-2xl bg-card p-3 text-body ring-1 ring-ring/40"
    />
  )
}

const COLUMN_PAGE = 30

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
  // Big columns render in pages of 30 (the column scrolls on its own); «Ще N» shows the next page.
  const [limit, setLimit] = useState(COLUMN_PAGE)
  const shownIds = cardIds.length > limit ? cardIds.slice(0, limit) : cardIds
  const hidden = cardIds.length - shownIds.length
  return (
    <UiCard
      className={cn(
        'max-h-full w-[288px] shrink-0 gap-0 rounded-3xl p-2 transition-colors',
        isOver && 'bg-accent'
      )}
    >
      <ColumnHeader column={column} count={cardIds.length} columns={columns} />
      <div ref={setNodeRef} className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-0.5 py-1">
        <SortableContext items={shownIds} strategy={verticalListSortingStrategy}>
          {shownIds.map((id) => {
            const card = cardsById.get(id)
            return card ? (
              <SortableCard key={id} card={card} done={column.isDone} columns={columns} onOpen={() => onOpen(id)} />
            ) : null
          })}
        </SortableContext>
        {hidden > 0 && (
          <Button variant="subtle" size="sm" className="mx-auto my-1" onClick={() => setLimit((l) => l + COLUMN_PAGE)}>
            Ще {Math.min(hidden, COLUMN_PAGE)} з {hidden}
          </Button>
        )}
      </div>
      <div className="pt-1">
        <QuickAddCard boardId={column.boardId} columnId={column.id} />
      </div>
    </UiCard>
  )
}

function AddColumn({ boardId }: { boardId: string }) {
  const [title, setTitle] = useState('')
  const add = useApiMutation('boards', 'addColumn')
  return (
    <form
      className="w-[260px] shrink-0"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        add.mutate({ boardId, input: { title: title.trim() } })
        setTitle('')
      }}
    >
      {/* Dashed = an empty slot; once you type it becomes a normal field (no dashed border under the focus ring). */}
      <InputGroup className="h-12 rounded-3xl border-dashed bg-transparent has-[input:focus]:border-solid has-[input:focus]:bg-foreground/[0.04]">
        <InputGroupAddon>
          <Plus />
        </InputGroupAddon>
        <InputGroupInput
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Нова колонка"
          aria-label="Назва нової колонки"
        />
        {title.trim() && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" size="xs" variant="default" className="rounded-full">
              Додати
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
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
