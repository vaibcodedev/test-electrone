import { useState, type ReactElement } from 'react'
import { openUrl } from '@/lib/open-url'
import { useNavigate } from 'react-router'
import { addDays, format, isToday, isTomorrow, startOfDay } from 'date-fns'
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
import { EventDate } from '@/components/common/event-date'
import { STAGE_KIND_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_VARIANT, stageDate, stageRowText } from './labels'
import { askToSchedule, needsSchedule, ScheduleStageHost } from './schedule-stage'
import { Delayed, RowSkeleton } from '@/components/common/page-skeleton'

/** History is a range: 30 at a time, «Показати раніші» adds the next 30 (docs/design-system.md → Формы). */
const PAST_STEP = 30
/** Upcoming stages and undated vacancies load this many; a cut list says so instead of looking complete. */
const LIMIT = 100

function CutNote({ where, label, onClick }: { where: string; label: string; onClick: () => void }): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <p className="text-caption text-muted-foreground">
        Показано перші {LIMIT} — решта {where}.
      </p>
      {/* soft: the page background is card, where subtle doesn't read as a button. */}
      <Button variant="soft" size="xs" onClick={onClick}>
        {label} <ArrowRight />
      </Button>
    </div>
  )
}

function groupUpcoming(list: StageWithApplication[], now: number): { title: string; items: StageWithApplication[] }[] {
  // Calendar days, not 7 × 24 h: a DST change would shift the edge by an hour.
  const week = addDays(startOfDay(now), 7).getTime()
  const groups: Record<string, StageWithApplication[]> = { Сьогодні: [], Завтра: [], 'Цього тижня': [], Пізніше: [] }
  for (const s of list) {
    const t = stageDate(s)
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

function StageItem({ stage, past }: { stage: StageWithApplication; past?: boolean }): ReactElement {
  const navigate = useNavigate()
  const t = stageDate(stage)
  const eventId = stage.kind === 'test_task' ? (stage.deadlineEventId ?? stage.eventId) : stage.eventId
  const isLink = /^https?:\/\//i.test(stage.location)
  const text = stageRowText(stage)
  // Upcoming: the type is the badge. Past: the badge is the outcome, so the type leads the second line.
  const description = past ? [STAGE_KIND_LABEL[stage.kind], text.description].filter(Boolean).join(' · ') : text.description
  return (
    <Item variant="muted" size="sm" className="gap-3">
      <EventDate when={t} className="bg-card" />
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{text.title}</ItemTitle>
        {description && <ItemDescription className="truncate text-caption">{description}</ItemDescription>}
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
export function InterviewsPage(): ReactElement {
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const [pastLimit, setPastLimit] = useState(PAST_STEP)
  const upcomingQ = useApi('jobs', 'upcoming', LIMIT)
  const pastQ = useApi('jobs', 'pastStages', pastLimit, KEEP_PERIOD)
  // Vacancies already in «Співбесіда» / «Тестове» with nothing in the calendar — the page must show them too.
  const interviewQ = useApi('jobs', 'list', { status: 'interview', limit: LIMIT, offset: 0 })
  const testQ = useApi('jobs', 'list', { status: 'test', limit: LIMIT, offset: 0 })
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
        {loading ? (
          <Delayed delay={150}>
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <RowSkeleton key={i} height={72} />
              ))}
            </div>
          </Delayed>
        ) : upcoming.length === 0 && past.length === 0 && undated.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Співбесід поки немає"
            hint="Відкрийте вакансію й додайте етап — скринінг, технічну співбесіду чи тестове."
            cta={{ label: 'До вакансій', onClick: () => navigate('/jobs/applications') }}
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
                        <ItemTitle className="w-full truncate">{a.company || a.title}</ItemTitle>
                        <ItemDescription className="truncate text-caption">
                          {[a.company ? a.title : '', a.status === 'test' ? 'Тестове без терміну здачі' : 'Співбесіда без дати']
                            .filter(Boolean)
                            .join(' · ')}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="gap-1.5">
                        <Button variant="subtle" size="sm" onClick={() => askToSchedule(a, a.status)}>
                          <CalendarPlus /> Запланувати
                        </Button>
                        <Button variant="subtle" size="sm" onClick={() => navigate(`/jobs/applications?open=${a.id}`)}>
                          Вакансія <ArrowRight />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
                {(inInterview.length === LIMIT || inTest.length === LIMIT) && (
                  <CutNote where="у вакансіях" label="Вакансії" onClick={() => navigate('/jobs/applications')} />
                )}
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
            {upcoming.length === LIMIT && <CutNote where="в календарі" label="Календар" onClick={() => navigate('/calendar')} />}

            {past.length > 0 && (
              <section className="flex flex-col gap-2 pt-2">
                <h2 className="text-body font-medium text-muted-foreground">
                  {/* A cut list doesn't show its size: «Минулі · 30» would read as «all of them». */}
                  Минулі{pastCut ? '' : ` · ${past.length}`}
                  {/* Counted over the loaded part only, so a cut history doesn't pretend it is the total. */}
                  {!pastCut && (passed > 0 || failed > 0) && ` — пройдено ${passed}, не пройдено ${failed}`}
                </h2>
                <ItemGroup className="gap-2">
                  {past.map((s) => (
                    <StageItem key={s.id} stage={s} past />
                  ))}
                </ItemGroup>
                {pastCut && (
                  <Button variant="soft" size="sm" className="self-start" onClick={() => setPastLimit((n) => n + PAST_STEP)}>
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
