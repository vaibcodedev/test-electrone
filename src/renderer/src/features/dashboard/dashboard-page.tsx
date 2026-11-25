import type { ReactElement } from 'react'
import { useApi } from '@/lib/query'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { LoadError } from '@/features/route-error'
import { Activity } from './activity'
import { Agenda } from './agenda'
import { GuideHint } from './guide-hint'
import { InboxIdeasCard, PinnedCard, ReadingCard, RecentCard } from './home-lists'
import { EnglishTile, QuickTiles, TimerTile } from './home-tiles'
import { TodayCard } from './today-card'

/** Home: loads the dashboard once (refreshed every minute) and lays the tiles out on a 12-column grid. */
export function DashboardPage(): ReactElement {
  const { data, isError, refetch } = useApi('app', 'dashboard', undefined, {
    refetchInterval: 60_000
  })
  if (!data && isError)
    return <LoadError title="Не вдалося завантажити головну" onRetry={() => void refetch()} />
  // Same shape as the route skeleton (handle.skeleton = 'dashboard'): no jump between the two.
  if (!data) return <PageSkeleton kind="dashboard" />

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="stagger grid grid-cols-12 gap-3">
        <GuideHint />
        <TodayCard cards={data.today.cards} overdue={data.today.overdue} />
        <Agenda items={data.today.agenda} />

        <QuickTiles />
        <TimerTile timer={data.timer} weekMinutes={data.weekMinutes} />
        <EnglishTile due={data.english.due} word={data.english.wordOfDay} />

        <PinnedCard pinned={data.pinned} favorites={data.favorites} />
        <RecentCard recent={data.recent} />
        <Activity data={data.activity} />

        <InboxIdeasCard ideas={data.inboxIdeas} />
        <ReadingCard reading={data.reading} />
      </div>
    </div>
  )
}
