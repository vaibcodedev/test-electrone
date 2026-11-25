import { forwardRef, type ComponentProps } from 'react'
import { CalendarClock, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { askToSchedule, needsSchedule } from './schedule-stage'
import type { Application, JobBoard } from '@shared/domain/jobs'
import { daysSince } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { agoLabel, salaryLabel, STAGE_KIND_SHORT, whenLabel } from './labels'
import { BoardLabel } from './board-label'

/** Compact vacancy tile for the kanban (shadcn Card + Badge). */
export const ApplicationCard = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & { application: Application; board?: JobBoard; now: number; dragging?: boolean }
>(function ApplicationCard({ application: a, board, now, dragging, className, ...rest }, ref) {
  const salary = salaryLabel(a.salaryMin, a.salaryMax, a.currency)
  const salaryShort = salaryLabel(a.salaryMin, a.salaryMax, a.currency, true)
  const days = daysSince(a.appliedAt, now)
  const unscheduled = needsSchedule(a, a.status)
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
      {unscheduled && (
        // Interview / test status but nothing in the calendar yet.
        <div className="flex items-center gap-1.5">
          <Badge variant="warn">без дати</Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="subtle"
                size="icon-xs"
                aria-label="Запланувати"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  askToSchedule(a, a.status)
                }}
              >
                <CalendarPlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{a.status === 'test' ? 'Додати тестове з терміном' : 'Запланувати співбесіду'}</TooltipContent>
          </Tooltip>
        </div>
      )}
      {(salary || (a.nextStage && !unscheduled)) && (
        <div className="flex flex-wrap items-center gap-1">
          {a.nextStage && !unscheduled && (
            <Badge variant={nextSoon ? 'success' : 'info'} className="max-w-full">
              <CalendarClock />
              <span className="truncate">
                {STAGE_KIND_SHORT[a.nextStage.kind]}, {whenLabel(a.nextStage.at)}
              </span>
            </Badge>
          )}
          {salary &&
            (salaryShort === salary ? (
              <Badge variant="outline">{salary}</Badge>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline">{salaryShort}</Badge>
                </TooltipTrigger>
                <TooltipContent>{salary}</TooltipContent>
              </Tooltip>
            ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-meta text-muted-foreground">
        {board && <BoardLabel board={board} />}
        <span className="ml-auto shrink-0">{a.status === 'saved' ? 'не надіслано' : agoLabel(days)}</span>
      </div>
    </Card>
  )
})
