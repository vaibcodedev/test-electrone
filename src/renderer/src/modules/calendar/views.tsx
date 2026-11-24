import { eachDayOfInterval, format, isSameMonth, isToday } from 'date-fns'
import { Plus } from 'lucide-react'
import type { CalendarItem } from '@shared/domain/calendar'
import { LOCALE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { dayKey, itemColor, SOURCE_LABEL } from './items'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MAX_IN_CELL = 3

function timeLabel(item: CalendarItem): string {
  return item.allDay ? '' : format(item.startAt, 'HH:mm')
}

/** A single item chip inside a day cell. */
function ItemChip({ item, onOpen }: { item: CalendarItem; onOpen: (item: CalendarItem) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item)
      }}
      title={`${SOURCE_LABEL[item.source]}: ${item.title}`}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left text-[11.5px] leading-tight hover:bg-surface',
        item.done && 'text-muted-foreground line-through'
      )}
    >
      <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: itemColor(item) }} />
      {timeLabel(item) && <span className="shrink-0 text-muted-foreground tabular-nums">{timeLabel(item)}</span>}
      <span className="truncate">{item.title}</span>
    </button>
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
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onKeyDown={(e) => e.key === 'Enter' && onDayClick(day)}
              className={cn(
                'group flex min-h-[92px] cursor-pointer flex-col gap-0.5 overflow-hidden rounded-2xl p-1.5 transition-colors',
                inMonth ? 'bg-surface/60 hover:bg-surface' : 'bg-transparent opacity-55 hover:bg-surface/50',
                today && 'bg-card ring-2 ring-lime'
              )}
            >
              <div className="flex items-center justify-between px-1 pb-0.5">
                <span
                  className={cn(
                    'grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12.5px] tabular-nums',
                    today && 'bg-ink font-medium text-lime'
                  )}
                >
                  {format(day, 'd')}
                </span>
                <Plus className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </div>
              {items.slice(0, MAX_IN_CELL).map((item) => (
                <ItemChip key={item.key} item={item} onOpen={onItemClick} />
              ))}
              {items.length > MAX_IN_CELL && (
                <span className="px-1.5 text-[11px] text-muted-foreground">ещё {items.length - MAX_IN_CELL}</span>
              )}
            </div>
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
          <div
            key={day.toISOString()}
            className={cn('flex min-h-0 flex-col rounded-3xl p-3', today ? 'ink-card rounded-3xl' : 'bg-surface')}
          >
            <div className="flex items-baseline justify-between px-1">
              <span className={cn('text-[12px] capitalize', today ? 'text-ink-muted' : 'text-muted-foreground')}>
                {format(day, 'EEEEEE', { locale: LOCALE })}
              </span>
              <span className={cn('font-display text-[28px] leading-none', today && 'text-lime')}>{format(day, 'd')}</span>
            </div>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onItemClick(item)}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-2xl px-3 py-2 text-left',
                    today ? 'bg-white/7 hover:bg-white/12' : 'bg-card hover:ring-1 hover:ring-border'
                  )}
                  style={{ boxShadow: `inset 3px 0 0 ${itemColor(item)}` }}
                >
                  <span className={cn('text-[11px] tabular-nums', today ? 'text-ink-muted' : 'text-muted-foreground')}>
                    {item.allDay ? SOURCE_LABEL[item.source] : format(item.startAt, 'HH:mm')}
                    {item.endAt && !item.allDay ? `–${format(item.endAt, 'HH:mm')}` : ''}
                  </span>
                  <span className={cn('text-[12.5px] leading-snug', item.done && 'line-through opacity-60')}>{item.title}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => onDayClick(day)}
                className={cn(
                  'mt-auto flex h-8 items-center justify-center gap-1 rounded-full text-[12px]',
                  today ? 'text-ink-muted hover:bg-white/8' : 'text-muted-foreground hover:bg-card'
                )}
              >
                <Plus className="size-3.5" /> Событие
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
