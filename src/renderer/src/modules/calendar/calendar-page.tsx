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
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { CalendarItem } from '@shared/domain/calendar'
import { KEEP_PERIOD, useApi } from '@/lib/query'
import { LOCALE, capitalize, fmtWeekRange } from '@/lib/format'
import { useUi } from '@/stores/ui-store'
import { useHotkey } from '@/hooks/use-hotkey'
import { Page, Segmented } from '@/components/common/page'
import { useOpenParam } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EventDialog } from './event-dialog'
import { ExportIcsDialog } from './export-dialog'
import { groupByDay, itemColor, SOURCE_LABEL } from './items'
import { MonthView, WeekView } from './views'

type View = 'month' | 'week'
const WEEK = { weekStartsOn: 1 as const, locale: LOCALE }

export function CalendarPage() {
  const navigate = useNavigate()
  const view = (useUi((s) => s.views.calendar) as View | undefined) ?? 'month'
  const setView = useUi((s) => s.setView)
  const [cursor, setCursor] = useState(() => new Date())
  const [open, setOpen] = useOpenParam()
  const [newDate, setNewDate] = useState<Date | null>(null)
  const [exporting, setExporting] = useState(false)

  const { from, to } = useMemo(() => {
    if (view === 'week') return { from: startOfWeek(cursor, WEEK), to: endOfWeek(cursor, WEEK) }
    return {
      from: startOfWeek(startOfMonth(cursor), WEEK),
      to: endOfWeek(endOfMonth(cursor), WEEK)
    }
  }, [cursor, view])

  const { data: items = [] } = useApi(
    'events',
    'feed',
    { from: from.getTime(), to: to.getTime() },
    KEEP_PERIOD
  )
  const { data: openEvent } = useApi('events', 'get', open ?? '', { enabled: !!open })
  const byDay = useMemo(() => groupByDay(items), [items])

  const step = (dir: 1 | -1): void =>
    setCursor((c) => (view === 'week' ? addWeeks(c, dir) : addMonths(c, dir)))
  useHotkey('arrowleft', () => step(-1))
  useHotkey('arrowright', () => step(1))
  useHotkey('t', () => setCursor(new Date()))

  const openItem = (item: CalendarItem): void => {
    if (item.route) navigate(item.route)
    else if (item.source === 'event') setOpen(item.ref.id)
    else navigate(ENTITY_META[item.ref.type].route(item.ref.id))
  }

  const title =
    view === 'week'
      ? fmtWeekRange(from, to, { year: true })
      : capitalize(format(cursor, 'LLLL yyyy', { locale: LOCALE }))

  // The legend shows the colour the grid actually uses; events vary by the user's choice, so they keep the default.
  const legend = (Object.keys(SOURCE_LABEL) as CalendarItem['source'][]).flatMap((s) => {
    const sample = items.find((i) => i.source === s)
    return sample
      ? [{ source: s, color: itemColor(s === 'event' ? { ...sample, color: null } : sample) }]
      : []
  })

  return (
    <Page>
      {/* data-slot: the global N presses the lime «Подія» here, like in any PageHeader. */}
      <header
        data-slot="page-header"
        // Wraps in a narrow window (960 px with the sidebar open, or next to the chat): the controls go under the
        // title, right-aligned, instead of running past the page edge.
        className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-5"
      >
        <div>
          <h1 className="font-display text-title">{title}</h1>
          {legend.length ? (
            // A plain legend, not badges: it explains colours and isn't a filter.
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-muted-foreground">
              {legend.map((l) => (
                <span key={l.source} className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full ring-1 ring-foreground/20"
                    style={{ background: l.color }}
                  />
                  {SOURCE_LABEL[l.source]}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-caption text-muted-foreground">
              Події, дедлайни, оплати, підписки та співбесіди — в одному місці.
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<View>
            options={[
              { value: 'month', label: 'Місяць' },
              { value: 'week', label: 'Тиждень' }
            ]}
            value={view}
            onChange={(v) => setView('calendar', v)}
          />
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="soft"
                  size="icon-sm"
                  onClick={() => step(-1)}
                  aria-label="Назад (←)"
                >
                  <ChevronLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Назад · ←</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="soft" size="sm" onClick={() => setCursor(new Date())}>
                  Сьогодні
                </Button>
              </TooltipTrigger>
              <TooltipContent>До сьогодні · T</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="soft"
                  size="icon-sm"
                  onClick={() => step(1)}
                  aria-label="Вперед (→)"
                >
                  <ChevronRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Вперед · →</TooltipContent>
            </Tooltip>
          </ButtonGroup>
          {/* An icon: with a text label the header ran past the page edge in a narrow window or next to the chat. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="soft"
                size="icon"
                aria-label="Експорт у .ics"
                onClick={() => setExporting(true)}
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Експорт у .ics — для телефона чи іншого календаря</TooltipContent>
          </Tooltip>
          <Button variant="lime" onClick={() => setNewDate(new Date())}>
            <Plus /> Подія
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        {view === 'month' ? (
          <MonthView
            cursor={cursor}
            from={from}
            to={to}
            byDay={byDay}
            onDayClick={setNewDate}
            onItemClick={openItem}
          />
        ) : (
          <WeekView
            from={from}
            to={to}
            byDay={byDay}
            onDayClick={setNewDate}
            onItemClick={openItem}
          />
        )}
      </div>

      <ExportIcsDialog open={exporting} onOpenChange={setExporting} />
      <EventDialog open={!!newDate} onOpenChange={(o) => !o && setNewDate(null)} date={newDate} />
      <EventDialog
        open={!!open && !!openEvent}
        onOpenChange={(o) => !o && setOpen(null)}
        event={openEvent ?? null}
      />
    </Page>
  )
}
