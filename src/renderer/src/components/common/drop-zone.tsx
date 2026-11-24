import type { ReactElement, ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'

/**
 * Kanban column body that accepts dragged cards (dnd-kit droppable `id`, e.g. `status:replied`).
 * Lime tint + ring while a card is over it. `compact` — a lane inside the collapsed «Закриті»
 * column; otherwise it fills the column and scrolls with `className="overflow-y-auto"`.
 */
export function DropZone({
  id,
  children,
  className,
  compact
}: {
  id: string
  children?: ReactNode
  className?: string
  compact?: boolean
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-2 rounded-2xl transition-colors',
        compact ? 'min-h-14 p-2' : 'min-h-24 flex-1 p-1',
        isOver && 'bg-lime-soft ring-2 ring-inset ring-ring/60',
        className
      )}
    >
      {children}
    </div>
  )
}
