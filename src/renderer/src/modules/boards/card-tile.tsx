import { forwardRef, type HTMLAttributes } from 'react'
import { format } from 'date-fns'
import { CalendarClock, ListChecks } from 'lucide-react'
import type { Card } from '@shared/domain/boards'
import { fmtDay } from '@/lib/format'
import { TagList } from '@/components/common/tags'
import { cn } from '@/lib/utils'
import { PRIORITY_DOT, PRIORITY_LABEL } from './labels'
import { hasTime, isOverdue } from './use-card-param'

export function DueChip({ dueAt, done, className }: { dueAt: number; done: boolean; className?: string }) {
  const late = isOverdue(dueAt, done)
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium',
        late ? 'bg-destructive/12 text-destructive' : done ? 'bg-success/15 text-success' : 'bg-card text-muted-foreground',
        className
      )}
    >
      <CalendarClock className="size-3" />
      {fmtDay(dueAt)}
      {hasTime(dueAt) && ` ${format(dueAt, 'HH:mm')}`}
    </span>
  )
}

/** Compact kanban card. Presentational: drag props are passed in by the sortable wrapper. */
export const CardTile = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { card: Card; done: boolean; dragging?: boolean; overlay?: boolean }
>(function CardTile({ card, done, dragging, overlay, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        'cursor-grab rounded-2xl bg-card p-3 text-left shadow-[0_1px_0_rgb(0_0_0/0.04)] ring-1 ring-border transition-shadow select-none hover:ring-foreground/15 active:cursor-grabbing',
        dragging && 'opacity-35',
        overlay && 'rotate-[1.5deg] shadow-xl ring-foreground/20',
        className
      )}
    >
      <div className="flex items-start gap-2">
        {card.priority !== 'none' && (
          <span
            title={PRIORITY_LABEL[card.priority]}
            className={cn('mt-[5px] size-2 shrink-0 rounded-full', PRIORITY_DOT[card.priority])}
          />
        )}
        <span className={cn('min-w-0 flex-1 text-[13px] leading-snug', done && 'text-muted-foreground line-through')}>
          {card.title}
        </span>
      </div>
      {card.tags.length > 0 && <TagList tags={card.tags} max={3} className="mt-2" />}
      {(card.dueAt || card.checklistTotal > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.dueAt && <DueChip dueAt={card.dueAt} done={done} />}
          {card.checklistTotal > 0 && (
            <span
              className={cn(
                'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium',
                card.checklistDone === card.checklistTotal ? 'bg-lime text-lime-foreground' : 'bg-surface text-muted-foreground'
              )}
            >
              <ListChecks className="size-3" />
              {card.checklistDone}/{card.checklistTotal}
            </span>
          )}
        </div>
      )}
    </div>
  )
})
