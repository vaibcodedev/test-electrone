import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { CalendarItem } from '@shared/domain/calendar'
import { useApi } from '@/lib/query'
import { LOCALE } from '@/lib/format'
import { useUi } from '@/stores/ui-store'
import { useHotkey } from '@/hooks/use-hotkey'
import { FilterChips, Page } from '@/components/common/page'
import { useOpenParam } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import { EventDialog } from './event-dialog'
import { groupByDay, itemColor, SOURCE_LABEL } from './items'
import { MonthView, WeekView } from './views'

type View = 'month' | 'week'
const WEEK = { weekStartsOn: 1 as const, locale: LOCALE }

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function CalendarPage() {
  const navigate = useNavigate()
  const view = (useUi((s) => s.views.calendar) as View | undefined) ?? 'month'
  const setView = useUi((s) => s.setView)
  const [cursor, setCursor] = useState(() => new Date())
  const [open, setOpen] = useOpenParam()
  const [newDate, setNewDate] = useState<Date | null>(null)

  const { from, to } = useMemo(() => {
    if (view === 'week') return { from: startOfWeek(cursor, WEEK), to: endOfWeek(cursor, WEEK) }
    return { from: startOfWeek(startOfMonth(cursor), WEEK), to: endOfWeek(endOfMonth(cursor), WEEK) }
  }, [cursor, view])

  const { data: items = [] } = useApi('events', 'feed', { from: from.getTime(), to: to.getTime() })
  const { data: openEvent } = useApi('events', 'get', open ?? '', { enabled: !!open })
  const byDay = useMemo(() => groupByDay(items), [items])

  const step = (dir: 1 | -1): void => setCursor((c) => (view === 'week' ? addWeeks(c, dir) : addMonths(c, dir)))
  useHotkey('arrowleft', () => step(-1))
  useHotkey('arrowright', () => step(1))
  useHotkey('t', () => setCursor(new Date()))

  const openItem = (item: CalendarItem): void => {
    if (item.source === 'event') setOpen(item.ref.id)
    else navigate(ENTITY_META[item.ref.type].route(item.ref.id))
  }

  const title =
    view === 'week'
      ? `${format(from, 'd MMM', { locale: LOCALE })} — ${format(to, 'd MMM yyyy', { locale: LOCALE })}`
      : capitalize(format(cursor, 'LLLL yyyy', { locale: LOCALE }))

  const legend = (['event', 'card', 'payment', 'project'] as const).filter((s) => items.some((i) => i.source === s))

  return (
    <Page>
      <header className="flex items-end justify-between gap-6 px-8 pt-7 pb-5">
        <div>
          <h1 className="font-display text-title">{title}</h1>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
            {legend.length ? (
              legend.map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: itemColor({ source: s, color: null } as CalendarItem) }}
                  />
                  {SOURCE_LABEL[s]}
                </span>
              ))
            ) : (
              <span>События, дедлайны карточек, оплаты и сроки проектов — в одном месте.</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FilterChips<View>
            options={[
              { value: 'month', label: 'Месяц' },
              { value: 'week', label: 'Неделя' }
            ]}
            value={view}
            onChange={(v) => v && setView('calendar', v)}
          />
          <div className="flex items-center gap-1 rounded-full bg-surface p-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label="Назад">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
              Сегодня
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label="Вперёд">
              <ChevronRight />
            </Button>
          </div>
          <Button variant="lime" onClick={() => setNewDate(new Date())}>
            <Plus /> Событие
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        {view === 'month' ? (
          <MonthView cursor={cursor} from={from} to={to} byDay={byDay} onDayClick={setNewDate} onItemClick={openItem} />
        ) : (
          <WeekView from={from} to={to} byDay={byDay} onDayClick={setNewDate} onItemClick={openItem} />
        )}
      </div>

      <EventDialog open={!!newDate} onOpenChange={(o) => !o && setNewDate(null)} date={newDate} />
      <EventDialog
        open={!!open && !!openEvent}
        onOpenChange={(o) => !o && setOpen(null)}
        event={openEvent ?? null}
      />
    </Page>
  )
}
