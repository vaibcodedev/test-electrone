import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { DueCard } from '@shared/domain/boards'
import { LOCALE, capitalize, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SegmentBar } from '@/components/common/page'
import { PRIORITY_DOT } from '@/modules/boards/labels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { RowLink } from './row-link'

const TODAY_LIMIT = 6

/** The ink hero tile: today's and overdue board cards. */
export function TodayCard({
  cards,
  overdue
}: {
  cards: DueCard[]
  overdue: DueCard[]
}): ReactElement {
  const all = [...overdue, ...cards]
  const done = all.filter((c) => c.columnIsDone).length
  const open = all.filter((c) => !c.columnIsDone)
  const [todayStart] = useState(() => new Date().setHours(0, 0, 0, 0))
  const navigate = useNavigate()
  return (
    <Card className="col-span-7 min-h-[300px] gap-0 bg-ink p-6 text-ink-foreground">
      <div className="flex items-center justify-between text-caption text-ink-muted">
        <span>{capitalize(format(new Date(), 'EEEE, d MMMM', { locale: LOCALE }))}</span>
        {all.length > 0 && (
          <Badge variant="soft" className="bg-ink-foreground/10 text-ink-foreground tabular-nums">
            {done}/{all.length}
          </Badge>
        )}
      </div>
      <h2 className="font-display mt-3 text-title">
        {open.length
          ? `${open.length} ${plural(open.length, ['завдання', 'завдання', 'завдань'])} на сьогодні`
          : all.length
            ? 'Усе зроблено'
            : 'Вільний день'}
      </h2>
      {all.length > 0 && (
        <SegmentBar
          value={done}
          total={all.length}
          segments={Math.min(all.length, 8)}
          className="mt-4 text-ink-foreground"
        />
      )}
      <ItemGroup className="mt-5 gap-0.5">
        {open.slice(0, TODAY_LIMIT).map((c) => {
          const late = c.dueAt! < todayStart
          return (
            <RowLink
              key={c.id}
              to={ENTITY_META.card.route(c.id)}
              // On ink the lime ring is invisible in the dark theme (≈1,1:1): focus takes the ink-foreground colour.
              className="rounded-xl text-ink-foreground hover:bg-ink-foreground/8 focus-visible:border-ink-foreground focus-visible:ring-ink-foreground/60"
            >
              <ItemMedia>
                <span className={cn('size-2 rounded-full', PRIORITY_DOT[c.priority])} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full truncate text-lead font-normal">{c.title}</ItemTitle>
              </ItemContent>
              {/* No status colours on ink (§6): «прострочено» is ink-foreground with an icon, only the dot stays red. */}
              {late ? (
                <span className="flex shrink-0 items-center gap-1 text-caption text-ink-foreground">
                  <CircleAlert className="size-3.5" /> прострочено
                </span>
              ) : (
                // The board name gives way to the title: it truncates instead of wrapping out of the card.
                <span
                  className="max-w-[40%] min-w-0 truncate text-caption text-ink-muted"
                  title={c.boardTitle}
                >
                  {c.boardTitle}
                </span>
              )}
            </RowLink>
          )
        })}
      </ItemGroup>
      {open.length > TODAY_LIMIT && (
        <Button
          variant="subtle"
          size="xs"
          className="mt-2 self-start bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15 focus-visible:outline-ink-foreground"
          onClick={() => navigate('/calendar')}
        >
          Ще {open.length - TODAY_LIMIT} <ArrowRight />
        </Button>
      )}
      {!all.length && (
        <p className="mt-4 max-w-sm text-body text-ink-muted">
          Поставте дедлайн картці на дошці — вона з’явиться тут у потрібний день.
        </p>
      )}
    </Card>
  )
}
