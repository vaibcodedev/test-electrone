/**
 * Month grid and week agenda. The grid layout itself is custom (shadcn has no event calendar),
 * but every cell and item is composed of shadcn Card / Button / Badge.
 */
import { useCallback, useState } from 'react'
import { eachDayOfInterval, format, isSameMonth, isToday } from 'date-fns'
import { Plus } from 'lucide-react'
import type { CalendarItem } from '@shared/domain/calendar'
import { capitalize, dayKey, LOCALE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { itemColor, SOURCE_LABEL, timeOnDay } from './items'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
/** Month cell geometry (px) for the «how many lines fit» count: padding, day header, one item line, gap. */
const CELL = { pad: 16, header: 26, line: 19, gap: 2 }

/** Lines that fit a month cell of the current window size (all cells share one row height). */
function useCellCapacity(rows: number): [(el: HTMLDivElement | null) => void, number] {
  const [height, setHeight] = useState(0)
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const cell = rows ? (height - (rows - 1) * 6) / rows : 0
  const room = cell - CELL.pad - CELL.header
  return [ref, Math.max(1, Math.floor((room + CELL.gap) / (CELL.line + CELL.gap)))]
}

/** A single item inside a month cell. `dim` — a day of the neighbouring month: quieter text, still readable. */
function ItemChip({
  item,
  day,
  onOpen,
  dim
}: {
  item: CalendarItem
  day: Date
  onOpen: (item: CalendarItem) => void
  dim?: boolean
}) {
  const time = timeOnDay(item, day).short
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
        'h-auto w-full justify-start gap-1.5 rounded-lg px-1.5 py-0.5 text-meta leading-tight font-normal hover:bg-card active:translate-y-0',
        (item.done || dim) && 'text-muted-foreground',
        item.done && 'line-through'
      )}
    >
      <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: itemColor(item) }} />
      {time && <span className="shrink-0 text-muted-foreground tabular-nums">{time}</span>}
      <span className="truncate">{item.title}</span>
    </Button>
  )
}

/** "+N" in a full month cell: opens the whole day's list in a popover. */
function MoreItems({
  day,
  items,
  count,
  onOpen
}: {
  day: Date
  items: CalendarItem[]
  count: number
  onOpen: (item: CalendarItem) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          onClick={(e) => e.stopPropagation()}
          className="h-auto w-full justify-start gap-1.5 rounded-lg px-1.5 py-0.5 text-meta leading-tight font-medium text-muted-foreground hover:bg-card hover:text-foreground"
        >
          {/* Same column as the item bars, so «ще 2» lines up with the titles above. */}
          <span className="w-1 shrink-0" />
          ще {count}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="px-1.5 pb-1.5 text-caption font-semibold">{capitalize(format(day, 'EEEE, d MMMM', { locale: LOCALE }))}</div>
        <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => (
            <ItemChip key={item.key} item={item} day={day} onOpen={onOpen} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  /** Without it the grid is read-only: no «+ Нова подія», cells don't react to clicks (a board's deadlines). */
  onDayClick?: (day: Date) => void
  onItemClick: (item: CalendarItem) => void
}) {
  const days = eachDayOfInterval({ start: from, end: to })
  const rows = days.length / 7
  const [gridRef, capacity] = useCellCapacity(rows)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 gap-1.5 pb-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 text-caption text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div ref={gridRef} className="grid min-h-0 flex-1 grid-cols-7 gap-1.5" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const items = byDay.get(dayKey(day)) ?? []
          const inMonth = isSameMonth(day, cursor)
          const today = isToday(day)
          return (
            <Card
              key={day.toISOString()}
              onClick={onDayClick && (() => onDayClick(day))}
              className={cn(
                // overflow-clip (not hidden): never becomes a scroll container, so no flash of a scrollbar on click.
                'group min-h-[92px] gap-0.5 overflow-clip rounded-2xl p-2 transition-colors',
                onDayClick && 'cursor-pointer',
                // Neighbouring month: no fill and a muted number instead of opacity, so titles keep their contrast.
                inMonth ? 'bg-surface/60 hover:bg-surface' : 'bg-transparent hover:bg-surface/50',
                today && 'bg-surface ring-1 ring-lime/70 ring-inset'
              )}
            >
              <div className="flex items-center justify-between pb-0.5">
                {/* Today = filled lime circle (one accent); other days keep the same box so numbers line up. */}
                <span
                  className={cn(
                    // text-box trims the font's ascender/descender gap, so digits sit in the optical center.
                    'grid size-6 place-items-center rounded-full text-caption leading-none tabular-nums [text-box:trim-both_cap_alphabetic]',
                    !inMonth && 'text-muted-foreground',
                    today && 'bg-lime font-semibold text-lime-foreground'
                  )}
                  aria-current={today ? 'date' : undefined}
                >
                  {format(day, 'd')}
                </span>
                {onDayClick && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Нова подія ${format(day, 'd MMMM', { locale: LOCALE })}`}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDayClick(day)
                    }}
                  >
                    <Plus />
                  </Button>
                )}
              </div>
              {(() => {
                // Lines are counted from the real cell height: a fixed 3 overflowed short cells into the rounded corner.
                const shown = items.length > capacity ? items.slice(0, capacity - 1) : items
                const rest = items.length - shown.length
                return (
                  <>
                    {shown.map((item) => (
                      <ItemChip key={item.key} item={item} day={day} onOpen={onItemClick} dim={!inMonth} />
                    ))}
                    {rest > 0 && <MoreItems day={day} items={items} count={rest} onOpen={onItemClick} />}
                  </>
                )
              })()}
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
            // Today = lime frame + lime date pill, same language as the month grid (an inverted ink column
            // turned into a blinding light strip in the dark theme).
            className={cn('min-h-0 gap-0 rounded-3xl p-3', today && 'ring-2 ring-lime/70 ring-inset')}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-caption text-muted-foreground capitalize">{format(day, 'EEEEEE', { locale: LOCALE })}</span>
              <span
                className={cn(
                  'font-display rounded-full px-2 py-0.5 text-stat-sm leading-none tabular-nums',
                  today && 'bg-lime text-lime-foreground'
                )}
                aria-current={today ? 'date' : undefined}
              >
                {format(day, 'd')}
              </span>
            </div>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto [scrollbar-gutter:auto]">
              {items.map((item) => (
                <Button
                  key={item.key}
                  variant="ghost"
                  title={item.title}
                  onClick={() => onItemClick(item)}
                  className={cn(
                    // Full column width, a calm radius, bar + time + title: reads like an agenda row.
                    'relative h-auto w-full flex-col items-start gap-0.5 rounded-xl bg-card py-2 pr-3 pl-5 text-left font-normal text-foreground whitespace-normal [overflow-wrap:anywhere] hover:bg-(--tile-hover) hover:text-foreground',
                    item.done && 'opacity-60'
                  )}
                >
                  {/* A real bar, not an inset shadow: on a rounded item the shadow bent into a crescent. */}
                  <span className="absolute top-2.5 bottom-2.5 left-2 w-1 rounded-full" style={{ background: itemColor(item) }} />
                  <span className="text-meta text-muted-foreground tabular-nums">{timeOnDay(item, day).long}</span>
                  <span className={cn('line-clamp-3 text-caption leading-snug font-medium', item.done && 'line-through')}>
                    {item.title}
                  </span>
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDayClick(day)}
                className="mt-auto font-normal text-muted-foreground hover:bg-card"
              >
                <Plus /> Подія
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
