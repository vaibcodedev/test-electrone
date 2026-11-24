import { useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi } from '@/lib/query'
import { LOCALE } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PRIORITY_DOT } from './labels'
import { isOverdue } from './use-card-param'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

/** Month grid of this board's cards by due date. */
export function CalendarView({ boardId, onOpenCard }: { boardId: string; onOpenCard: (id: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const gridStart = startOfWeek(month, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const { data: cards = [] } = useApi('cards', 'due', {
    from: gridStart.getTime(),
    to: gridEnd.getTime() + 86_399_999,
    boardId
  })
  const days = useMemo(() => {
    const out: Date[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d)
    return out
  }, [gridStart.getTime(), gridEnd.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps
  const noDate = cards.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col px-8 pb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display min-w-48 text-stat-sm capitalize">{format(month, 'LLLL yyyy', { locale: LOCALE })}</h2>
        <Button variant="soft" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Попередній місяць">
          <ChevronLeft />
        </Button>
        <Button variant="soft" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Наступний місяць">
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
          Сьогодні
        </Button>
        {noDate && <span className="ml-auto text-caption text-muted-foreground">Цього місяця немає карток із дедлайном</span>}
      </div>
      <div className="grid grid-cols-7 gap-1.5 pb-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 text-meta text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1.5">
        {days.map((day) => {
          const list = cards.filter((c) => c.dueAt && isSameDay(c.dueAt, day))
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'flex min-h-0 flex-col gap-1 overflow-hidden rounded-2xl p-1.5',
                isSameMonth(day, month) ? 'bg-surface' : 'bg-surface/40'
              )}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full text-caption tabular-nums',
                  isToday(day) ? 'bg-ink font-medium text-ink-accent' : !isSameMonth(day, month) && 'text-muted-foreground'
                )}
              >
                {format(day, 'd')}
              </span>
              <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
                {list.map((c) => (
                  <Button
                    key={c.id}
                    variant="ghost"
                    size="xs"
                    onClick={() => onOpenCard(c.id)}
                    title={c.title}
                    className={cn(
                      'h-auto w-full justify-start gap-1.5 rounded-lg bg-card px-1.5 py-1 text-left text-meta font-normal hover:bg-card hover:ring-1 hover:ring-border',
                      c.columnIsDone && 'text-muted-foreground line-through',
                      isOverdue(c.dueAt, c.columnIsDone) && 'text-destructive'
                    )}
                  >
                    <span className={cn('size-1.5 shrink-0 rounded-full', PRIORITY_DOT[c.priority])} />
                    <span className="truncate">{c.title}</span>
                  </Button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
