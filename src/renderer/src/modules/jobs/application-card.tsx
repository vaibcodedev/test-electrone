import { forwardRef, type ComponentProps } from 'react'
import { CalendarClock } from 'lucide-react'
import type { Application, JobBoard } from '@shared/domain/jobs'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { agoLabel, daysSince, salaryLabel, STAGE_KIND_SHORT, whenLabel } from './j1-labels'

/** Compact vacancy tile for the kanban (shadcn Card + Badge). */
export const ApplicationCard = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & { application: Application; board?: JobBoard; now: number; dragging?: boolean }
>(function ApplicationCard({ application: a, board, now, dragging, className, ...rest }, ref) {
  const salary = salaryLabel(a.salaryMin, a.salaryMax, a.currency)
  const days = daysSince(a.appliedAt, now)
  const nextSoon = a.nextStage?.at && a.nextStage.at - now < 2 * 86_400_000 && a.nextStage.at > now - 3 * 3600_000
  return (
    <Card
      ref={ref}
      role="button"
      tabIndex={0}
      className={cn(
        'cursor-pointer gap-2 rounded-2xl bg-card px-3.5 py-3 ring-1 ring-border transition-shadow outline-none hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring',
        dragging && 'opacity-40',
        className
      )}
      {...rest}
    >
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-2 text-body leading-snug font-medium">{a.title}</span>
        {a.company && <span className="truncate text-caption text-muted-foreground">{a.company}</span>}
      </div>
      {(salary || a.nextStage) && (
        <div className="flex flex-wrap items-center gap-1">
          {a.nextStage && (
            <Badge variant={nextSoon ? 'lime' : 'info'} className="max-w-full">
              <CalendarClock />
              <span className="truncate">
                {STAGE_KIND_SHORT[a.nextStage.kind]}, {whenLabel(a.nextStage.at)}
              </span>
            </Badge>
          )}
          {salary && <Badge variant="outline">{salary}</Badge>}
        </div>
      )}
      <div className="flex items-center gap-2 text-meta text-muted-foreground">
        {board && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: board.color ?? 'var(--muted-foreground)' }} />
            <span className="truncate">{board.name}</span>
          </span>
        )}
        <span className="ml-auto shrink-0">{a.status === 'saved' ? 'не отправлено' : agoLabel(days)}</span>
      </div>
    </Card>
  )
})
