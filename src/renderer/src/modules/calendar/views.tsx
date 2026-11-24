/**
 * Month grid and week agenda. The grid layout itself is custom (shadcn has no event calendar),
 * but every cell and item is composed of shadcn Card / Button / Badge.
 */
import { eachDayOfInterval, format, isSameMonth, isToday } from 'date-fns'
import { Plus } from 'lucide-react'
import type { CalendarItem } from '@shared/domain/calendar'
import { LOCALE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { dayKey, itemColor, SOURCE_LABEL } from './items'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MAX_IN_CELL = 3

function timeLabel(item: CalendarItem): string {
  return item.allDay ? '' : format(item.startAt, 'HH:mm')
}

/** A single item inside a month cell. */
function ItemChip({ item, onOpen }: { item: CalendarItem; onOpen: (item: CalendarItem) => void }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item)
      }}
      title={`${SOURCE_LABEL[item.source]}: ${item.title}`}
      className={cn(
        'h-auto w-full justify-start gap-1.5 rounded-lg px-1.5 py-0.5 text-[11.5px] leading-tight font-normal hover:bg-card',
        item.done && 'text-muted-foreground line-through'
      )}
    >
      <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: itemColor(item) }} />
      {timeLabel(item) && <span className="shrink-0 text-muted-foreground tabular-nums">{timeLabel(item)}</span>}
      <span className="truncate">{item.title}</span>
    </Button>
  )
}

export function MonthView({
  cursor,
  from,
  to,
  byDay,
  onDayClick,
  onItemClick
}: {
  cursor: Date
  from: Date
  to: Date
  byDay: Map<string, CalendarItem[]>
  onDayClick: (day: Date) => void
  onItemClick: (item: CalendarItem) => void
}) {
  const days = eachDayOfInterval({ start: from, end: to })
  const rows = days.length / 7
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 gap-1.5 pb-1.5">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={cn('px-2 text-[12px] text-muted-foreground', i >= 5 && 'text-muted-foreground/70')}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1.5" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const items = byDay.get(dayKey(day)) ?? []
          const inMonth = isSameMonth(day, cursor)
          const today = isToday(day)
          return (
            <Card
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn(
                'group min-h-[92px] cursor-pointer gap-0.5 overflow-hidden rounded-2xl p-1.5 transition-colors',
                inMonth ? 'bg-surface/60 hover:bg-surface' : 'bg-transparent opacity-55 hover:bg-surface/50',
                today && 'bg-card ring-2 ring-lime'
              )}
            >
              <div className="flex items-center justify-between pb-0.5">
                {today ? (
                  <Badge variant="ink" className="h-6 min-w-6 px-1.5 text-[12.5px] tabular-nums">
                    {format(day, 'd')}
                  </Badge>
                ) : (
                  <span className="grid h-6 min-w-6 place-items-center px-1 text-[12.5px] tabular-nums">{format(day, 'd')}</span>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Новое событие ${format(day, 'd MMMM', { locale: LOCALE })}`}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDayClick(day)
                  }}
                >
                  <Plus />
                </Button>
              </div>
              {items.slice(0, MAX_IN_CELL).map((item) => (
                <ItemChip key={item.key} item={item} onOpen={onItemClick} />
              ))}
              {items.length > MAX_IN_CELL && (
                <span className="px-1.5 text-[11px] text-muted-foreground">ещё {items.length - MAX_IN_CELL}</span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export function WeekView({
  from,
  to,
  byDay,
  onDayClick,
  onItemClick
}: {
  from: Date
  to: Date
  byDay: Map<string, CalendarItem[]>
  onDayClick: (day: Date) => void
  onItemClick: (item: CalendarItem) => void
}) {
  const days = eachDayOfInterval({ start: from, end: to })
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7 gap-2">
      {days.map((day) => {
        const items = byDay.get(dayKey(day)) ?? []
        const today = isToday(day)
        return (
          <Card
            key={day.toISOString()}
            className={cn('min-h-0 gap-0 rounded-3xl p-3', today && 'bg-ink text-ink-foreground')}
          >
            <div className="flex items-baseline justify-between px-1">
              <span className={cn('text-[12px] capitalize', today ? 'text-ink-muted' : 'text-muted-foreground')}>
                {format(day, 'EEEEEE', { locale: LOCALE })}
              </span>
              <span className={cn('font-display text-[28px] leading-none', today && 'text-ink-accent')}>{format(day, 'd')}</span>
            </div>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {items.map((item) => (
                <Button
                  key={item.key}
                  variant="ghost"
                  onClick={() => onItemClick(item)}
                  className={cn(
                    'h-auto flex-col items-start gap-0.5 rounded-2xl px-3 py-2 text-left font-normal whitespace-normal',
                    today ? 'bg-ink-foreground/7 hover:bg-ink-foreground/12' : 'bg-card hover:bg-card hover:ring-1 hover:ring-border'
                  )}
                  style={{ boxShadow: `inset 3px 0 0 ${itemColor(item)}` }}
                >
                  <span className={cn('text-[11px] tabular-nums', today ? 'text-ink-muted' : 'text-muted-foreground')}>
                    {item.allDay ? SOURCE_LABEL[item.source] : format(item.startAt, 'HH:mm')}
                    {item.endAt && !item.allDay ? `–${format(item.endAt, 'HH:mm')}` : ''}
                  </span>
                  <span className={cn('text-[12.5px] leading-snug', item.done && 'line-through opacity-60')}>{item.title}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDayClick(day)}
                className={cn(
                  'mt-auto font-normal',
                  today ? 'text-ink-muted hover:bg-ink-foreground/8 hover:text-ink-foreground' : 'text-muted-foreground hover:bg-card'
                )}
              >
                <Plus /> Событие
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
