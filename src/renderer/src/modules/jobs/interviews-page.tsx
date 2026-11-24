import { useState } from 'react'
import { useNavigate } from 'react-router'
import { format, isToday, isTomorrow } from 'date-fns'
import { CalendarDays, ExternalLink, Video } from 'lucide-react'
import type { StageWithApplication } from '@shared/domain/jobs'
import { useApi } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtDate, LOCALE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { STAGE_KIND_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_VARIANT } from './j1-labels'

const when = (s: StageWithApplication): number | null => (s.kind === 'test_task' ? (s.deadlineAt ?? s.at) : s.at)

function groupUpcoming(list: StageWithApplication[], now: number): { title: string; items: StageWithApplication[] }[] {
  const week = now + 7 * 86_400_000
  const groups: Record<string, StageWithApplication[]> = { Сегодня: [], Завтра: [], 'На этой неделе': [], Позже: [] }
  for (const s of list) {
    const t = when(s)
    if (!t) groups['Позже'].push(s)
    else if (isToday(t) || t < now) groups['Сегодня'].push(s)
    else if (isTomorrow(t)) groups['Завтра'].push(s)
    else if (t < week) groups['На этой неделе'].push(s)
    else groups['Позже'].push(s)
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
      <ItemMedia className="w-16 flex-col items-start gap-0 self-center text-left">
        <span className="text-body font-medium tabular-nums">{t ? format(t, 'HH:mm') : '—'}</span>
        <span className="text-meta text-muted-foreground">{t ? fmtDate(t, 'd MMM') : 'без даты'}</span>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">
          {stage.kind === 'test_task' ? 'Сдать тестовое' : stage.title || STAGE_KIND_LABEL[stage.kind]}
          <span className="font-normal text-muted-foreground"> — {stage.company || stage.applicationTitle}</span>
        </ItemTitle>
        <ItemDescription className="truncate text-caption">
          {stage.applicationTitle}
          {stage.interviewers ? ` · ${stage.interviewers}` : ''}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-1">
        {past && <Badge variant={STAGE_STATUS_VARIANT[stage.status]}>{STAGE_STATUS_LABEL[stage.status]}</Badge>}
        {!past && isLink && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="soft" size="icon-sm" className="bg-card" aria-label="Открыть ссылку" onClick={() => void api.app.openExternal(stage.location)}>
                <Video />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{stage.kind === 'test_task' ? 'Открыть задание' : 'Подключиться'}</TooltipContent>
          </Tooltip>
        )}
        {eventId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="soft" size="icon-sm" className="bg-card" aria-label="Открыть в календаре" onClick={() => navigate(`/calendar?open=${eventId}`)}>
                <CalendarDays />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Открыть в календаре</TooltipContent>
          </Tooltip>
        )}
        <Button variant="soft" size="sm" className="bg-card" onClick={() => navigate(`/jobs/applications?open=${stage.applicationId}`)}>
          Вакансия <ExternalLink />
        </Button>
      </ItemActions>
    </Item>
  )
}

/** All interview rounds and test deadlines across vacancies: upcoming first, then history with outcomes. */
export function InterviewsPage() {
  const navigate = useNavigate()
  const [now] = useState(() => Date.now())
  const { data: upcoming = [], isLoading } = useApi('jobs', 'upcoming', 100)
  const { data: past = [] } = useApi('jobs', 'pastStages', 100)
  const groups = groupUpcoming(upcoming, now)
  const passed = past.filter((s) => s.status === 'passed').length
  const failed = past.filter((s) => s.status === 'failed').length

  return (
    <Page>
      <PageHeader
        title="Собеседования"
        subtitle="Все этапы из вакансий. Время меняется и здесь, и в календаре — они связаны."
        actions={
          <Button variant="soft" onClick={() => navigate('/calendar')}>
            <CalendarDays /> Календарь
          </Button>
        }
      />
      <PageBody className="flex flex-col gap-6">
        {!isLoading && upcoming.length === 0 && past.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Собеседований пока нет"
            hint="Откройте вакансию и добавьте этап — скрининг, техническое или тестовое."
            action={
              <Button variant="lime" onClick={() => navigate('/jobs/applications')}>
                К вакансиям
              </Button>
            }
          />
        ) : (
          <>
            {groups.length === 0 ? (
              <Card className="py-5">
                <CardContent className="text-body text-muted-foreground">Ближайших этапов нет.</CardContent>
              </Card>
            ) : (
              groups.map((g) => (
                <section key={g.title} className="flex flex-col gap-2">
                  <h2 className={cn('text-body font-medium', g.title === 'Сегодня' ? 'text-foreground' : 'text-muted-foreground')}>
                    {g.title}
                    {g.title === 'Сегодня' && ` · ${format(now, 'd MMMM', { locale: LOCALE })}`}
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
                  Прошедшие · {past.length}
                  {(passed > 0 || failed > 0) && ` — успешно ${passed}, не прошёл ${failed}`}
                </h2>
                <ItemGroup className="gap-2">
                  {past.map((s) => (
                    <StageItem key={s.id} stage={s} past />
                  ))}
                </ItemGroup>
              </section>
            )}
          </>
        )}
      </PageBody>
    </Page>
  )
}
