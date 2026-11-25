import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Settings2 } from 'lucide-react'
import { useApi } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FollowUpsCard, HabitCard, TodayCard, UpcomingCard } from './overview-cards'

function Counter({ label, value, hint, onClick, accent }: { label: string; value: number; hint?: string; onClick?: () => void; accent?: boolean }): ReactElement {
  return (
    <Card className={cn('gap-3 py-4', accent && 'bg-ink text-ink-foreground')}>
      <CardContent className="flex flex-col gap-2">
        <span className={cn('text-body font-medium', accent ? 'text-ink-muted' : 'text-muted-foreground')}>{label}</span>
        <div className="flex items-end justify-between gap-3">
          <span className="font-display text-stat leading-none tabular-nums">{value}</span>
          {hint && onClick && (
            <Button variant="subtle" size="xs" className={cn(accent && 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15')} onClick={onClick}>
              {hint} <ArrowRight />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Job search hub landing: today's board habit, upcoming interviews, follow-ups, counters. */
export function JobsOverviewPage(): ReactElement {
  const navigate = useNavigate()
  const { data } = useApi('jobs', 'overview')

  if (!data) return <PageSkeleton kind="overview" />

  return (
    <Page>
      <PageHeader
        title="Пошук роботи"
        subtitle="Майданчики на сьогодні, найближчі співбесіди й те, що час довести до кінця."
        actions={
          <>
            <Button variant="soft" onClick={() => navigate('/jobs/boards')}>
              <Settings2 /> Майданчики
            </Button>
            <Button variant="lime" onClick={() => navigate('/jobs/applications')}>
              Вакансії
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="stagger grid grid-cols-12 gap-3">
          <TodayCard today={data.today} />
          <HabitCard today={data.today} />

          <div className="col-span-12 grid grid-cols-3 gap-3">
            <Counter label="Активних вакансій" value={data.activeCount} hint="Відкрити вакансії" onClick={() => navigate('/jobs/applications')} />
            {/* With no offers there is nothing to look at, and the move would repeat «Відкрити вакансії». */}
            <Counter
              label="Оферів"
              value={data.offers}
              accent={data.offers > 0}
              hint={data.offers > 0 ? 'Переглянути' : undefined}
              onClick={data.offers > 0 ? () => navigate('/jobs/applications') : undefined}
            />
            <Counter
              label="Питань до повторення"
              value={data.questionsDue}
              hint={data.questionsDue ? 'Почати тренування' : 'Банк питань'}
              onClick={() => navigate(data.questionsDue ? '/jobs/questions/practice' : '/jobs/questions')}
            />
          </div>

          <UpcomingCard upcoming={data.upcoming} />
          <FollowUpsCard followUps={data.followUps} />
        </div>
      </PageBody>
    </Page>
  )
}
