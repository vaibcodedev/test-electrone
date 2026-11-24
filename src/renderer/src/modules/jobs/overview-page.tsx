import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { ArrowRight, BellRing, ExternalLink, Flame, Settings2 } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { DailyBoard } from '@shared/domain/jobs'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { LOCALE, fmtDay, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DailyHeatmap } from './daily-heatmap'
import { STAGE_KIND_LABEL } from './j2-labels'

function TodayRow({ board }: { board: DailyBoard }) {
  const checkin = useApiMutation('jobs', 'checkin')
  const t = board.today
  const target = board.dailyTarget
  return (
    <Item variant="muted" size="sm" className={cn(t.done && 'bg-chart-1/12')}>
      <Checkbox
        id={`board-${board.id}`}
        checked={t.checked || t.done}
        disabled={t.done && !t.checked}
        onCheckedChange={(v) => checkin.mutate({ boardId: board.id, day: t.day, checked: v === true })}
        aria-label={`Отметить ${board.name} на сегодня`}
        className="size-5 rounded-full"
      />
      <ItemContent className="min-w-0">
        <ItemTitle className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: board.color ?? 'var(--muted-foreground)' }} />
          {board.name}
        </ItemTitle>
        <ItemDescription className="text-caption">
          {target > 0
            ? `${t.applied} из ${target} ${plural(target, ['отклика', 'откликов', 'откликов'])}`
            : t.applied
              ? `${t.applied} ${plural(t.applied, ['отклик', 'отклика', 'откликов'])}`
              : 'просто проверить'}
          {t.checked && !t.applied ? ' · проверил, подходящего нет' : ''}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {board.streak > 0 && (
          <Badge variant="soft" className="bg-card font-normal">
            <Flame className="text-warn" /> {board.streak}
          </Badge>
        )}
        {board.url && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Открыть ${board.name}`} onClick={() => api.app.openExternal(board.url)}>
                <ExternalLink />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Открыть {board.name}</TooltipContent>
          </Tooltip>
        )}
      </ItemActions>
    </Item>
  )
}

function Counter({ label, value, hint, onClick, accent }: { label: string; value: number; hint?: string; onClick?: () => void; accent?: boolean }) {
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
export function JobsOverviewPage() {
  const navigate = useNavigate()
  const { data } = useApi('jobs', 'overview')
  const { data: settings } = useApi('settings', 'get')

  if (!data) {
    return (
      <Page>
        <PageHeader title="Поиск работы" />
        <PageBody className="grid grid-cols-2 gap-3">
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </PageBody>
      </Page>
    )
  }

  const expected = data.today.filter((b) => b.today.expected)
  const pending = expected.filter((b) => !b.today.done)
  const reminder = settings?.jobReminderTime

  return (
    <Page>
      <PageHeader
        title="Поиск работы"
        subtitle="Площадки на сегодня, ближайшие собеседования и то, что пора довести до конца."
        actions={
          <>
            <Button variant="soft" onClick={() => navigate('/jobs/boards')}>
              <Settings2 /> Площадки
            </Button>
            <Button variant="lime" onClick={() => navigate('/jobs/applications')}>
              Вакансии
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="grid animate-rise grid-cols-12 gap-3">
          <Card className="col-span-5">
            <CardHeader>
              <CardTitle>Сегодня, {format(new Date(), 'd MMMM', { locale: LOCALE })}</CardTitle>
              <CardDescription>
                {expected.length === 0
                  ? 'Сегодня по площадкам выходной.'
                  : pending.length
                    ? `Не отмечены: ${pending.map((b) => b.name).join(', ')}`
                    : 'Все площадки на сегодня закрыты.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.today.length === 0 ? (
                <EmptyState
                  title="Площадок пока нет"
                  hint="Добавьте Djinni, DOU, LinkedIn и задайте норму откликов в день."
                  action={<Button onClick={() => navigate('/jobs/boards')}>Добавить площадку</Button>}
                  className="py-6"
                />
              ) : (
                <ItemGroup className="gap-1.5">
                  {expected.map((b) => (
                    <TodayRow key={b.id} board={b} />
                  ))}
                </ItemGroup>
              )}
              <div className="mt-4 flex items-center gap-3 border-t pt-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card">
                  <BellRing className="size-4 text-muted-foreground" />
                </span>
                <p className="min-w-0 flex-1 text-caption leading-snug text-muted-foreground">
                  {reminder ? (
                    <>
                      Напомню в <span className="font-medium text-foreground tabular-nums">{reminder}</span>, если что-то не отмечено
                    </>
                  ) : (
                    'Вечернее напоминание выключено'
                  )}
                </p>
                <Button variant="subtle" size="xs" onClick={() => navigate('/settings')}>
                  {reminder ? 'Изменить время' : 'Включить'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-7">
            <CardHeader>
              <CardTitle>Последние 4 недели</CardTitle>
              <CardDescription>Отклик засчитывается сам; галочка закрывает день, если подходящих вакансий не было.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <DailyHeatmap boards={data.today} />
            </CardContent>
          </Card>

          <div className="col-span-12 grid grid-cols-3 gap-3">
            <Counter label="Активных откликов" value={data.activeCount} hint="Открыть вакансии" onClick={() => navigate('/jobs/applications')} />
            <Counter label="Офферов" value={data.offers} accent={data.offers > 0} hint="Посмотреть" onClick={() => navigate('/jobs/applications')} />
            <Counter
              label="Вопросов к повторению"
              value={data.questionsDue}
              hint={data.questionsDue ? 'Начать тренировку' : 'Банк вопросов'}
              onClick={() => navigate(data.questionsDue ? '/jobs/questions/practice' : '/jobs/questions')}
            />
          </div>

          <Card className="col-span-6">
            <CardHeader>
              <CardTitle>Ближайшие собеседования и тестовые</CardTitle>
              <CardAction>
                <Button variant="subtle" size="xs" onClick={() => navigate('/calendar')}>
                  Календарь
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.upcoming.length === 0 ? (
                <p className="text-body text-muted-foreground">Ничего не запланировано. Добавьте этап в вакансии — он сразу появится в календаре.</p>
              ) : (
                <ItemGroup className="gap-1.5">
                  {data.upcoming.map((s) => {
                    const when = s.at ?? s.deadlineAt
                    const kind = STAGE_KIND_LABEL[s.kind]
                    const stage = s.title && s.title !== kind ? s.title : null
                    return (
                      <Item key={s.id} asChild size="sm" className="cursor-pointer gap-3 bg-card p-2.5 pr-4 hover:ring-1 hover:ring-border">
                        <button type="button" className="w-full text-left" onClick={() => navigate(ENTITY_META.application.route(s.applicationId))}>
                          <span className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-xl bg-surface py-1.5">
                            <span className="text-meta leading-none text-muted-foreground">{when ? fmtDay(when) : '—'}</span>
                            {s.at && <span className="text-lead leading-tight font-semibold tabular-nums">{format(s.at, 'HH:mm')}</span>}
                          </span>
                          <ItemContent className="min-w-0 gap-1">
                            <ItemTitle className="w-full truncate">{s.company || s.applicationTitle}</ItemTitle>
                            <ItemDescription className="truncate text-caption">
                              {s.company ? s.applicationTitle : ''}
                              {stage ? `${s.company ? ' · ' : ''}${stage}` : ''}
                              {s.kind === 'test_task' && s.deadlineAt ? ' · сдать до срока' : ''}
                            </ItemDescription>
                          </ItemContent>
                          <Badge variant={s.kind === 'test_task' ? 'warn' : 'info'}>{kind}</Badge>
                        </button>
                      </Item>
                    )
                  })}
                </ItemGroup>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-6">
            <CardHeader>
              <CardTitle>Напомнить о себе</CardTitle>
              <CardDescription>Подошла дата напоминания или нет ответа неделю.</CardDescription>
              <CardAction>
                <Button variant="subtle" size="xs" onClick={() => navigate('/freelance/templates?situation=follow_up')}>
                  Шаблоны
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.followUps.length === 0 ? (
                <p className="text-body text-muted-foreground">Никого не нужно догонять.</p>
              ) : (
                <ItemGroup className="gap-1.5">
                  {data.followUps.slice(0, 8).map((a) => (
                    <Item key={a.id} asChild size="xs" className="cursor-pointer bg-card hover:ring-1 hover:ring-border">
                      <button type="button" className="w-full text-left" onClick={() => navigate(ENTITY_META.application.route(a.id))}>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="w-full truncate font-normal">{a.title}</ItemTitle>
                          <ItemDescription className="truncate text-meta">
                            {a.company || 'Компания не указана'}
                            {a.appliedAt ? ` · отправлено ${fmtDay(a.appliedAt)}` : ''}
                          </ItemDescription>
                        </ItemContent>
                        {a.followUpAt && <Badge variant="success">{fmtDay(a.followUpAt)}</Badge>}
                      </button>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </Page>
  )
}
