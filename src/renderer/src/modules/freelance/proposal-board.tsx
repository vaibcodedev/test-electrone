import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import type { Proposal, ProposalStatus } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ACTIVE_STATUSES, CLOSED_STATUSES, PROPOSAL_STATUS_LABEL } from './proposal-labels'
import { ProposalCard } from './proposal-card'
import { dropAnimation } from '@/lib/motion'

const PAGE = 30

interface BoardProps {
  proposals: Proposal[]
  currency: Currency
  creditsName?: string
  onOpen: (id: string) => void
}

function DraggableProposal({
  proposal,
  currency,
  creditsName,
  now,
  onOpen
}: {
  proposal: Proposal
  currency: Currency
  creditsName?: string
  now: number
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: proposal.id })
  return (
    <ProposalCard
      ref={setNodeRef}
      proposal={proposal}
      currency={currency}
      creditsName={creditsName}
      now={now}
      dragging={isDragging}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
      }}
      {...attributes}
      {...listeners}
    />
  )
}

/**
 * Proposals kanban: one column per pipeline status plus a collapsed «Закрытые» lane.
 * Dragging a card onto a column changes its status (optimistic, rolled back on error).
 */
export function ProposalBoard({ proposals, currency, creditsName, onOpen }: BoardProps) {
  const [overrides, setOverrides] = useState<Record<string, ProposalStatus>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [closedOpen, setClosedOpen] = useState(false)
  // Columns render in pages of 30: big pipelines stay fast and the column stays scannable.
  const [pages, setPages] = useState<Partial<Record<ProposalStatus, number>>>({})
  const visible = (status: ProposalStatus, list: Proposal[]): Proposal[] =>
    list.slice(0, (pages[status] ?? 1) * PAGE)
  const more = (status: ProposalStatus, list: Proposal[]): ReactNode => {
    const shown = (pages[status] ?? 1) * PAGE
    if (list.length <= shown) return null
    return (
      <Button
        variant="subtle"
        size="xs"
        className="mx-1 w-fit"
        onClick={() => setPages((p) => ({ ...p, [status]: (p[status] ?? 1) + 1 }))}
      >
        Ще {Math.min(PAGE, list.length - shown)} з {list.length - shown}
      </Button>
    )
  }
  const [now] = useState(() => Date.now())
  const update = useApiMutation('proposals', 'update', {
    onError: (_e, vars) =>
      setOverrides((o) => {
        const next = { ...o }
        delete next[vars.id]
        return next
      })
  })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

  // Drop optimistic overrides once the server data has caught up (or changed from elsewhere).
  useEffect(() => {
    setOverrides((o) => {
      const keys = Object.keys(o)
      if (!keys.length) return o
      const next = { ...o }
      for (const id of keys) {
        const server = proposals.find((p) => p.id === id)?.status
        if (!server || server === o[id]) delete next[id]
      }
      return Object.keys(next).length === keys.length ? o : next
    })
  }, [proposals])

  const byStatus = useMemo(() => {
    const map = new Map<ProposalStatus, Proposal[]>()
    for (const p of proposals) {
      const s = overrides[p.id] ?? p.status
      map.set(s, [...(map.get(s) ?? []), p])
    }
    return map
  }, [proposals, overrides])

  const closedCount = CLOSED_STATUSES.reduce((n, s) => n + (byStatus.get(s)?.length ?? 0), 0)
  const active = activeId ? proposals.find((p) => p.id === activeId) : undefined
  const showClosed = closedOpen || !!activeId

  const onDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent): void => {
    setActiveId(null)
    const over = e.over?.id ? String(e.over.id) : null
    if (!over?.startsWith('status:')) return
    const status = over.slice(7) as ProposalStatus
    const id = String(e.active.id)
    const current = overrides[id] ?? proposals.find((p) => p.id === id)?.status
    if (!current || current === status) return
    setOverrides((o) => ({ ...o, [id]: status }))
    update.mutate({ id, patch: { status } })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-2">
        {ACTIVE_STATUSES.map((status) => {
          const list = byStatus.get(status) ?? []
          return (
            <Card key={status} className="flex w-65 shrink-0 flex-col gap-2 rounded-3xl px-2 py-3">
              <div className="flex items-center gap-2 px-2">
                <span className="text-body font-medium">{PROPOSAL_STATUS_LABEL[status]}</span>
                <span className="text-caption text-muted-foreground tabular-nums">
                  {list.length}
                </span>
              </div>
              <DropZone id={`status:${status}`} className="overflow-y-auto">
                {visible(status, list).map((p) => (
                  <DraggableProposal
                    key={p.id}
                    proposal={p}
                    currency={currency}
                    creditsName={creditsName}
                    now={now}
                    onOpen={() => onOpen(p.id)}
                  />
                ))}
                {more(status, list)}
              </DropZone>
            </Card>
          )
        })}

        <Card
          className={cn(
            'flex shrink-0 flex-col gap-2 rounded-3xl px-2 py-3',
            showClosed ? 'w-65 overflow-y-auto' : 'w-14 items-center'
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClosedOpen(!closedOpen)}
            className={cn(
              'text-body',
              showClosed ? 'justify-between' : 'h-auto flex-col gap-2 px-1 py-2'
            )}
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
            CLOSED_STATUSES.map((status) => {
              const list = byStatus.get(status) ?? []
              return (
                <div key={status} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 px-2 text-caption text-muted-foreground">
                    {PROPOSAL_STATUS_LABEL[status]}{' '}
                    <span className="tabular-nums">{list.length}</span>
                  </div>
                  <DropZone id={`status:${status}`} compact className="bg-surface">
                    {visible(status, list).map((p) => (
                      <DraggableProposal
                        key={p.id}
                        proposal={p}
                        currency={currency}
                        creditsName={creditsName}
                        now={now}
                        onOpen={() => onOpen(p.id)}
                      />
                    ))}
                    {more(status, list)}
                  </DropZone>
                </div>
              )
            })}
        </Card>
      </div>
      <DragOverlay dropAnimation={dropAnimation()}>
        {active ? (
          <ProposalCard
            proposal={active}
            currency={currency}
            now={now}
            className="w-61 rotate-2 shadow-xl"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
