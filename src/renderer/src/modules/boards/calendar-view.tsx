import { useMemo, useState } from 'react'
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarItem } from '@shared/domain/calendar'
import { useApi } from '@/lib/query'
import { LOCALE, capitalize } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { groupByDay } from '@/modules/calendar/items'
import { MonthView } from '@/modules/calendar/views'
import { hasTime, isOverdue } from './use-card-param'

/** Month grid of this board's cards by due date: the calendar's own grid, read-only, overdue cards in red. */
export function CalendarView({ boardId, onOpenCard }: { boardId: string; onOpenCard: (id: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const gridStart = startOfWeek(month, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const { data: cards = [] } = useApi('cards', 'due', { from: gridStart.getTime(), to: gridEnd.getTime(), boardId })
  const byDay = useMemo(
    () =>
      groupByDay(
        cards.flatMap((c): CalendarItem[] =>
          c.dueAt
            ? [
                {
                  key: c.id,
                  source: 'card',
                  ref: { type: 'card', id: c.id },
                  title: c.title,
                  startAt: c.dueAt,
                  endAt: null,
                  allDay: !hasTime(c.dueAt),
                  color: isOverdue(c.dueAt, c.columnIsDone) ? 'var(--destructive)' : null,
                  done: c.columnIsDone
                }
              ]
            : []
        )
      ),
    [cards]
  )

  return (
    <div className="flex h-full min-h-0 flex-col px-8 pb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display min-w-48 text-stat-sm">{capitalize(format(month, 'LLLL yyyy', { locale: LOCALE }))}</h2>
        {/* The same «‹ | Сьогодні | ›» group as the calendar page. */}
        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="soft" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Назад">
                <ChevronLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Назад</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="soft" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
                Сьогодні
              </Button>
            </TooltipTrigger>
            <TooltipContent>До сьогодні</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="soft" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Вперед">
                <ChevronRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Вперед</TooltipContent>
          </Tooltip>
        </ButtonGroup>
        {cards.length === 0 && (
          <span className="ml-auto text-caption text-muted-foreground">Цього місяця немає карток із дедлайном</span>
        )}
      </div>
      <MonthView cursor={month} from={gridStart} to={gridEnd} byDay={byDay} onItemClick={(i) => onOpenCard(i.ref.id)} />
    </div>
  )
}
