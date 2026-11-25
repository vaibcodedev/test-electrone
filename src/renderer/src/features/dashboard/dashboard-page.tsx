import { Fragment, type ReactElement, type ReactNode } from 'react'
import { QUICK_ADD_PLACE } from '@/app/navigation'
import { useApi } from '@/lib/query'
import { useNavVisibility } from '@/hooks/use-nav-visibility'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { LoadError } from '@/features/route-error'
import { Activity } from './activity'
import { Agenda } from './agenda'
import { GuideHint } from './guide-hint'
import { InboxIdeasCard, PinnedCard, ReadingCard, RecentCard } from './home-lists'
import { EnglishTile, QuickTiles, TimerTile } from './home-tiles'
import { QUICK_TILES } from './quick-tiles'
import { COL_SPAN, rowSpans } from './layout'
import { TodayCard } from './today-card'

/** A home tile of a row: its base width on the 12-column grid and how it renders with the span it got. */
interface Tile {
  key: string
  base: number
  /** false — its section is switched off in «Налаштування → Меню». */
  shown: boolean
  render: (span: number) => ReactNode
}

/** The shown tiles of one row share all 12 columns; a row with none renders nothing. */
function Row({ tiles }: { tiles: Tile[] }): ReactElement | null {
  const shown = tiles.filter((t) => t.shown)
  const spans = rowSpans(shown.map((t) => t.base))
  if (shown.length === 0) return null
  return (
    <>
      {shown.map((t, i) => (
        <Fragment key={t.key}>{t.render(spans[i])}</Fragment>
      ))}
    </>
  )
}

/**
 * Home: loads the dashboard once (refreshed every minute) and lays the tiles out on a 12-column grid.
 * Tiles of sections switched off in the menu drop out and the rest of their row widens; the cross-module rows
 * (pinned, recent, activity) always stay.
 */
export function DashboardPage(): ReactElement {
  const { data, isError, refetch } = useApi('app', 'dashboard', undefined, {
    refetchInterval: 60_000
  })
  const { isShown } = useNavVisibility()
  if (!data && isError)
    return <LoadError title="Не вдалося завантажити головну" onRetry={() => void refetch()} />
  // Same shape as the route skeleton (handle.skeleton = 'dashboard'): no jump between the two.
  if (!data) return <PageSkeleton kind="dashboard" />

  const quick = QUICK_TILES.filter((q) => isShown(QUICK_ADD_PLACE[q.target]))

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="stagger grid grid-cols-12 gap-3">
        <GuideHint />
        <Row
          tiles={[
            {
              key: 'today',
              base: 7,
              shown: isShown('/boards'),
              render: (span) => (
                <TodayCard
                  cards={data.today.cards}
                  overdue={data.today.overdue}
                  className={COL_SPAN[span]}
                />
              )
            },
            {
              key: 'agenda',
              base: 5,
              shown: isShown('/calendar'),
              render: (span) => <Agenda items={data.today.agenda} className={COL_SPAN[span]} />
            }
          ]}
        />

        <Row
          tiles={[
            {
              key: 'quick',
              base: 6,
              shown: quick.length > 0,
              render: (span) => (
                <QuickTiles tiles={quick} wide={span === 12} className={COL_SPAN[span]} />
              )
            },
            {
              key: 'timer',
              base: 3,
              // A running timer is shown even with «Клієнти» off: it must stay stoppable.
              shown: isShown('/clients') || data.timer != null,
              render: (span) => (
                <TimerTile
                  timer={data.timer}
                  weekMinutes={data.weekMinutes}
                  className={COL_SPAN[span]}
                />
              )
            },
            {
              key: 'english',
              base: 3,
              shown: isShown('/english'),
              render: (span) => (
                <EnglishTile
                  due={data.english.due}
                  word={data.english.wordOfDay}
                  className={COL_SPAN[span]}
                />
              )
            }
          ]}
        />

        <PinnedCard pinned={data.pinned} />
        <RecentCard recent={data.recent} />
        <Activity data={data.activity} />

        <Row
          tiles={[
            {
              key: 'inbox',
              base: 6,
              shown: isShown('/ideas'),
              render: (span) => (
                <InboxIdeasCard ideas={data.inboxIdeas} className={COL_SPAN[span]} />
              )
            },
            {
              key: 'reading',
              base: 6,
              shown: isShown('/bookmarks'),
              render: (span) => <ReadingCard reading={data.reading} className={COL_SPAN[span]} />
            }
          ]}
        />
      </div>
    </div>
  )
}
