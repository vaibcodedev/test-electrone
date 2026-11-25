import { useEffect, useMemo, useState, type ReactNode, type ReactElement } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { DropZone } from '@/components/common/drop-zone'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Application, ApplicationStatus, JobBoard } from '@shared/domain/jobs'
import { useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ACTIVE_APP_STATUSES, APP_STATUS_LABEL, CLOSED_APP_STATUSES } from './labels'
import { ApplicationCard } from './application-card'
import { promptAfterStatusChange } from './schedule-stage'

function DraggableApplication({
  application,
  board,
  now,
  onOpen
}: {
  application: Application
  board?: JobBoard
  now: number
  onOpen: () => void
}): ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: application.id })
  return (
    <ApplicationCard
      ref={setNodeRef}
      application={application}
      board={board}
      now={now}
      dragging={isDragging}
      onClick={onOpen}
      {...attributes}
      {...listeners}
      // After the dnd-kit listeners: theirs would otherwise replace this handler. Enter opens, Space drags.
      // Keys of a nested control («Запланувати») and Enter mid keyboard-drag are not the card's (as in
      // clickableProps); the KeyboardSensor ignores events from anything but the card itself.
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || isDragging) return listeners?.onKeyDown?.(e)
        if (e.key === 'Enter') {
          e.preventDefault()
          onOpen()
          return
        }
        listeners?.onKeyDown?.(e)
      }}
    />
  )
}

/** A column renders 30 cards at a time (it scrolls on its own); «Ще N» adds the next 30. */
function PagedCards<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }): ReactElement {
  const [limit, setLimit] = useState(30)
  const hidden = Math.max(0, items.length - limit)
  return (
    <>
      {(hidden ? items.slice(0, limit) : items).map(render)}
      {hidden > 0 && (
        <Button variant="subtle" size="sm" className="mx-auto my-1" onClick={() => setLimit((l) => l + 30)}>
          Ще {Math.min(hidden, 30)} з {hidden}
        </Button>
      )}
    </>
  )
}

/** Enter opens a card, so only Space picks it up for a keyboard drag. */
const KEYBOARD_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space'] }

/**
 * Vacancies kanban: one column per pipeline status plus a collapsed «Закриті» lane.
 * Dropping a card on a column changes its status (optimistic, rolled back on error).
 */
export function ApplicationBoard({
  applications,
  boards,
  onOpen
}: {
  applications: Application[]
  boards: JobBoard[]
  onOpen: (id: string) => void
}): ReactElement {
  const [overrides, setOverrides] = useState<Record<string, ApplicationStatus>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [closedOpen, setClosedOpen] = useState(false)
  const [now] = useState(() => Date.now())
  const update = useApiMutation('jobs', 'update', {
    onError: (_e, vars) =>
      setOverrides((o) => {
        const next = { ...o }
        delete next[vars.id]
        return next
      })
  })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES }))
  const boardById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards])

  // Drop optimistic overrides once the server data caught up.
  useEffect(() => {
    setOverrides((o) => {
      const keys = Object.keys(o)
      if (!keys.length) return o
      const next = { ...o }
      for (const id of keys) {
        const server = applications.find((a) => a.id === id)?.status
        if (!server || server === o[id]) delete next[id]
      }
      return Object.keys(next).length === keys.length ? o : next
    })
  }, [applications])

  const byStatus = useMemo(() => {
    const map = new Map<ApplicationStatus, Application[]>()
    for (const a of applications) {
      const s = overrides[a.id] ?? a.status
      map.set(s, [...(map.get(s) ?? []), a])
    }
    return map
  }, [applications, overrides])

  const closedCount = CLOSED_APP_STATUSES.reduce((n, s) => n + (byStatus.get(s)?.length ?? 0), 0)
  const active = activeId ? applications.find((a) => a.id === activeId) : undefined
  const showClosed = closedOpen || !!activeId

  const onDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent): void => {
    setActiveId(null)
    const over = e.over?.id ? String(e.over.id) : null
    if (!over?.startsWith('status:')) return
    const status = over.slice(7) as ApplicationStatus
    const id = String(e.active.id)
    const current = overrides[id] ?? applications.find((a) => a.id === id)?.status
    if (!current || current === status) return
    setOverrides((o) => ({ ...o, [id]: status }))
    update.mutate({ id, patch: { status } })
    // Moved to «Співбесіда» / «Тестове» with nothing scheduled → offer to put it in the calendar.
    const app = applications.find((a) => a.id === id)
    if (app) promptAfterStatusChange(app, status)
  }

  const renderCard = (a: Application): ReactNode => (
    <DraggableApplication
      key={a.id}
      application={a}
      board={a.boardId ? boardById.get(a.boardId) : undefined}
      now={now}
      onOpen={() => onOpen(a.id)}
    />
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-2">
        {ACTIVE_APP_STATUSES.map((status) => {
          const list = byStatus.get(status) ?? []
          return (
            <Card key={status} className="flex w-65 shrink-0 flex-col gap-2 rounded-3xl px-2 py-3">
              <div className="flex items-center gap-2 px-2">
                <span className="text-body font-medium">{APP_STATUS_LABEL[status]}</span>
                <span className="text-caption text-muted-foreground tabular-nums">{list.length}</span>
              </div>
              <DropZone id={`status:${status}`} className="overflow-y-auto">
                {list.length === 0 ? (
                  <p className="px-2 py-3 text-meta text-muted-foreground">Перетягніть сюди картку</p>
                ) : (
                  <PagedCards items={list} render={renderCard} />
                )}
              </DropZone>
            </Card>
          )
        })}

        <Card className={cn('flex shrink-0 flex-col gap-2 rounded-3xl px-2 py-3', showClosed ? 'w-65' : 'w-14 items-center')}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClosedOpen(!closedOpen)}
            className={cn('text-body', showClosed ? 'justify-between' : 'h-auto flex-col gap-2 px-1 py-2')}
            aria-expanded={showClosed}
          >
            {showClosed ? (
              <>
                <span className="flex items-center gap-2">
                  Закриті <span className="text-muted-foreground tabular-nums">{closedCount}</span>
                </span>
                <ChevronLeft />
              </>
            ) : (
              <>
                <ChevronRight />
                <span className="[writing-mode:vertical-rl]">Закриті</span>
                <Badge variant="soft">{closedCount}</Badge>
              </>
            )}
          </Button>
          {showClosed &&
            CLOSED_APP_STATUSES.map((status) => {
              const list = byStatus.get(status) ?? []
              return (
                <div key={status} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 px-2 text-caption text-muted-foreground">
                    {APP_STATUS_LABEL[status]} <span className="tabular-nums">{list.length}</span>
                  </div>
                  <DropZone id={`status:${status}`} compact className="bg-surface">
                    {list.map(renderCard)}
                  </DropZone>
                </div>
              )
            })}
        </Card>
      </div>
      <DragOverlay>
        {active ? (
          <ApplicationCard
            application={active}
            board={active.boardId ? boardById.get(active.boardId) : undefined}
            now={now}
            className="w-61 rotate-2 shadow-xl"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
