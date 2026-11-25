import { useState } from 'react'
import { openUrl } from '@/lib/open-url'
import { useNavigate } from 'react-router'
import { format, isToday, isTomorrow } from 'date-fns'
import { ArrowRight, CalendarDays, CalendarPlus, Video } from 'lucide-react'
import type { StageWithApplication } from '@shared/domain/jobs'
import { KEEP_PERIOD, useApi } from '@/lib/query'
import { LOCALE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { IconAction } from '@/components/common/icon-action'
import { STAGE_KIND_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_VARIANT } from './labels'
import { askToSchedule, needsSchedule, ScheduleStageHost } from './schedule-stage'
import { StageDate } from './stage-row'

/** History is a range: 30 at a time, «Показати раніші» adds the next 30 (docs/design-system.md → Формы). */
const PAST_STEP = 30

const when = (s: StageWithApplication): number | null => (s.kind === 'test_task' ? (s.deadlineAt ?? s.at) : s.at)

function groupUpcoming(list: StageWithApplication[], now: number): { title: string; items: StageWithApplication[] }[] {
  const week = now + 7 * 86_400_000
  const groups: Record<string, StageWithApplication[]> = { Сьогодні: [], Завтра: [], 'Цього тижня': [], Пізніше: [] }
  for (const s of list) {
    const t = when(s)
    if (!t) groups['Пізніше'].push(s)
    else if (isToday(t) || t < now) groups['Сьогодні'].push(s)
    else if (isTomorrow(t)) groups['Завтра'].push(s)
    else if (t < week) groups['Цього тижня'].push(s)
    else groups['Пізніше'].push(s)
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([title, items]) => ({ title, items }))
}

function StageItem({ stage, past }: { stage: StageWithApplication; past?: boolean }) {
  const navigate = useNavigate()
  const t = when(stage)
  const eventId = stage.kind === 'test_task' ? (stage.deadlineEventId ?? stage.eventId) : stage.eventId
  const isLink = /^https?:\/\//i.test(stage.location)
  return (
    <Item variant="muted" size="sm" className={cn('gap-3', past && stage.status === 'cancelled' && 'opacity-60')}>
      <StageDate when={t} className="bg-card" />
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">
          {stage.kind === 'test_task' ? 'Здати тестове' : stage.title || STAGE_KIND_LABEL[stage.kind]}
          <span className="font-normal text-muted-foreground"> — {stage.company || stage.applicationTitle}</span>
        </ItemTitle>
        <ItemDescription className="truncate text-caption">
          {stage.applicationTitle}
          {stage.interviewers ? ` · ${stage.interviewers}` : ''}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-1">
        {past ? (
          <Badge variant={STAGE_STATUS_VARIANT[stage.status]}>{STAGE_STATUS_LABEL[stage.status]}</Badge>
        ) : (
          <Badge variant={stage.kind === 'test_task' ? 'warn' : 'info'}>{STAGE_KIND_LABEL[stage.kind]}</Badge>
        )}
        {!past && isLink && (
          <IconAction label={stage.kind === 'test_task' ? 'Відкрити завдання' : 'Підключитися'} onClick={() => void openUrl(stage.location)}>
            <Video />
          </IconAction>
        )}
        {eventId && (
          <IconAction label="Відкрити в календарі" onClick={() => navigate(`/calendar?open=${eventId}`)}>
            <CalendarDays />
          </IconAction>
        )}
        <Button variant="subtle" size="xs" onClick={() => navigate(`/jobs/applications?open=${stage.applicationId}`)}>
          Вакансія <ArrowRight />
        </Button>
      </ItemActions>
    </Item>
  )
}

/** All interview rounds and test deadlines across vacancies: upcoming first, then history with outcomes. */
export function InterviewsPage() {
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const [pastLimit, setPastLimit] = useState(PAST_STEP)
  const upcomingQ = useApi('jobs', 'upcoming', 100)
  const pastQ = useApi('jobs', 'pastStages', pastLimit, KEEP_PERIOD)
  // Vacancies already in «Співбесіда» / «Тестове» with nothing in the calendar — the page must show them too.
  const interviewQ = useApi('jobs', 'list', { status: 'interview', limit: 100, offset: 0 })
  const testQ = useApi('jobs', 'list', { status: 'test', limit: 100, offset: 0 })
  const upcoming = upcomingQ.data ?? []
  const past = pastQ.data ?? []
  const inInterview = interviewQ.data ?? []
  const inTest = testQ.data ?? []
  // The empty state waits for all four: otherwise it flashes while the history is still loading.
  const loading = upcomingQ.isLoading || pastQ.isLoading || interviewQ.isLoading || testQ.isLoading
  const pastCut = past.length >= pastLimit
  const undated = [...inInterview, ...inTest].filter((a) => needsSchedule(a, a.status))
  const groups = groupUpcoming(upcoming, now)
  const passed = past.filter((s) => s.status === 'passed').length
  const failed = past.filter((s) => s.status === 'failed').length

  return (
    <Page>
      <PageHeader
        title="Співбесіди"
        subtitle="Усі етапи з вакансій. Час змінюється і тут, і в календарі — вони пов’язані."
        actions={
          <Button variant="soft" onClick={() => navigate('/calendar')}>
            <CalendarDays /> Календар
          </Button>
        }
      />
      <PageBody className="flex flex-col gap-6">
        {loading ? null : upcoming.length === 0 && past.length === 0 && undated.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Співбесід поки немає"
            hint="Відкрийте вакансію й додайте етап — скринінг, технічну співбесіду чи тестове."
            action={
              <Button variant="lime" onClick={() => navigate('/jobs/applications')}>
                До вакансій
              </Button>
            }
          />
        ) : (
          <>
            {undated.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-body font-medium">
                  Без дати <Badge variant="warn">{undated.length}</Badge>
                </h2>
                <p className="text-caption text-muted-foreground">
                  Вакансії вже на етапі співбесіди чи тестового, але в календарі нічого немає.
                </p>
                <ItemGroup className="gap-2">
                  {undated.map((a) => (
                    <Item key={a.id} variant="muted" size="sm" className="gap-3">
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate">
                          {a.title}
                          {a.company && <span className="font-normal text-muted-foreground"> · {a.company}</span>}
                        </ItemTitle>
                        <ItemDescription className="text-caption">
                          {a.status === 'test' ? 'Тестове без терміну здачі' : 'Співбесіда без дати'}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="gap-1.5">
                        <Button variant="subtle" size="sm" onClick={() => askToSchedule(a, a.status)}>
                          <CalendarPlus /> Запланувати
                        </Button>
                        <Button variant="subtle" size="sm" onClick={() => navigate(`/jobs/applications?open=${a.id}`)}>
                          Відкрити <ArrowRight />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </section>
            )}
            {groups.length === 0 ? (
              <Card className="py-5">
                <CardContent className="text-body text-muted-foreground">Найближчих етапів немає.</CardContent>
              </Card>
            ) : (
              groups.map((g) => (
                <section key={g.title} className="flex flex-col gap-2">
                  <h2 className={cn('text-body font-medium', g.title === 'Сьогодні' ? 'text-foreground' : 'text-muted-foreground')}>
                    {g.title}
                    {g.title === 'Сьогодні' && ` · ${format(now, 'd MMMM', { locale: LOCALE })}`}
                  </h2>
                  <ItemGroup className="gap-2">
                    {g.items.map((s) => (
                      <StageItem key={s.id} stage={s} />
                    ))}
                  </ItemGroup>
                </section>
              ))
            )}

            {past.length > 0 && (
              <section className="flex flex-col gap-2 pt-2">
                <h2 className="text-body font-medium text-muted-foreground">
                  {/* A cut list doesn't show its size: «Минулі · 30» would read as «all of them». */}
                  Минулі{pastCut ? '' : ` · ${past.length}`}
                  {(passed > 0 || failed > 0) && ` — пройдено ${passed}, не пройдено ${failed}`}
                </h2>
                <ItemGroup className="gap-2">
                  {past.map((s) => (
                    <StageItem key={s.id} stage={s} past />
                  ))}
                </ItemGroup>
                {pastCut && (
                  <Button variant="subtle" size="sm" className="self-start" onClick={() => setPastLimit((n) => n + PAST_STEP)}>
                    Показати раніші
                  </Button>
                )}
              </section>
            )}
          </>
        )}
      </PageBody>
      <ScheduleStageHost />
    </Page>
  )
}
