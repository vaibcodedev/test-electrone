import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { differenceInCalendarDays, format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { CalendarItem } from '@shared/domain/calendar'
import { LOCALE, fmtDay, fmtDayFull } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CardEmptyText, ListCard } from '@/components/common/list-card'
import { Button } from '@/components/ui/button'
import { ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { RowLink } from './row-link'

const AGENDA_LIMIT = 5

/** «сьогодні»/«завтра» first; later days this week by weekday («п’ятниця» fits 64px, «27 листопада» wraps). */
function agendaDay(ts: number): string {
  const days = differenceInCalendarDays(ts, new Date())
  return days >= 2 && days <= 6 ? format(ts, 'EEEE', { locale: LOCALE }) : fmtDay(ts)
}

/** «Найближчі 3 дні»: the calendar feed for today and the next two days. */
export function Agenda({
  items,
  className
}: {
  items: CalendarItem[]
  /** Column span from the home grid (layout.ts). */
  className?: string
}): ReactElement {
  const navigate = useNavigate()
  return (
    <ListCard
      title="Найближчі 3 дні"
      className={className}
      action={
        <Button variant="subtle" size="xs" onClick={() => navigate('/calendar')}>
          Календар
        </Button>
      }
    >
      {items.length === 0 ? (
        <CardEmptyText>
          Подій поки немає. Додайте зустріч або нагадування в календарі.
        </CardEmptyText>
      ) : (
        <ItemGroup className="gap-1.5">
          {items.slice(0, AGENDA_LIMIT).map((i) => (
            // `route` overrides the ref (a subscription payment leads to its month of expenses, not to an event).
            <RowLink
              key={i.key}
              to={i.route ?? ENTITY_META[i.ref.type].route(i.ref.id)}
              className="bg-card hover:ring-1 hover:ring-border"
            >
              {/* Date block (design-system §10): the feed spans 3 days, a bare «15:00» hid which day it is.
                  Two lines and min-h-12 for every row: an all-day event is as tall as its neighbours. */}
              <div
                className="flex min-h-12 w-16 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-xl bg-surface py-1.5 text-center"
                title={fmtDayFull(i.startAt)}
              >
                <span className="text-meta leading-tight text-muted-foreground">
                  {agendaDay(i.startAt)}
                </span>
                {i.allDay ? (
                  <span className="text-meta leading-tight text-muted-foreground">весь день</span>
                ) : (
                  <span className="text-lead leading-tight font-semibold tabular-nums">
                    {format(i.startAt, 'HH:mm')}
                  </span>
                )}
              </div>
              <span
                className="h-6 w-1 shrink-0 rounded-full"
                style={{ background: i.color ?? 'var(--chart-bar)' }}
              />
              <ItemContent className="min-w-0">
                <ItemTitle
                  className={cn(
                    'w-full truncate font-normal',
                    i.done && 'text-muted-foreground line-through'
                  )}
                >
                  {i.title}
                </ItemTitle>
              </ItemContent>
            </RowLink>
          ))}
        </ItemGroup>
      )}
      {items.length > AGENDA_LIMIT && (
        <Button variant="subtle" size="xs" className="mt-2" onClick={() => navigate('/calendar')}>
          Ще {items.length - AGENDA_LIMIT} <ArrowRight />
        </Button>
      )}
    </ListCard>
  )
}
