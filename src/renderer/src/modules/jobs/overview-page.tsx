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
        aria-label={`Позначити ${board.name} на сьогодні`}
        className="size-5 rounded-full"
      />
      <ItemContent className="min-w-0">
        <ItemTitle className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: board.color ?? 'var(--muted-foreground)' }} />
          {board.name}
        </ItemTitle>
        <ItemDescription className="text-caption">
          {target > 0
            ? `${t.applied} з ${target} ${plural(target, ['відгуку', 'відгуків', 'відгуків'])}`
            : t.applied
              ? `${t.applied} ${plural(t.applied, ['відгук', 'відгуки', 'відгуків'])}`
              : 'просто перевірити'}
          {t.checked && !t.applied ? ' · перевірив, підхожого немає' : ''}
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
              <Button variant="ghost" size="icon-sm" aria-label={`Відкрити ${board.name}`} onClick={() => api.app.openExternal(board.url)}>
                <ExternalLink />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Відкрити {board.name}</TooltipContent>
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
        <PageHeader title="Пошук роботи" />
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
          <Card className="col-span-5">
            <CardHeader>
              <CardTitle>Сьогодні, {format(new Date(), 'd MMMM', { locale: LOCALE })}</CardTitle>
              <CardDescription>
                {expected.length === 0
                  ? 'Сьогодні на майданчиках вихідний.'
                  : pending.length
                    ? `Не позначено: ${pending.map((b) => b.name).join(', ')}`
                    : 'Усі майданчики на сьогодні закрито.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.today.length === 0 ? (
                <EmptyState
                  title="Майданчиків поки немає"
                  hint="Додайте Djinni, DOU, LinkedIn і задайте норму відгуків на день."
                  action={<Button onClick={() => navigate('/jobs/boards')}>Додати майданчик</Button>}
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
                      Нагадаю о <span className="font-medium text-foreground tabular-nums">{reminder}</span>, якщо щось не позначено
                    </>
                  ) : (
                    'Вечірнє нагадування вимкнено'
                  )}
                </p>
                <Button variant="subtle" size="xs" onClick={() => navigate('/settings')}>
                  {reminder ? 'Змінити час' : 'Увімкнути'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-7">
            <CardHeader>
              <CardTitle>Останні 4 тижні</CardTitle>
              <CardDescription>Відгук зараховується сам; позначка закриває день, якщо підхожих вакансій не було.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <DailyHeatmap boards={data.today} />
            </CardContent>
          </Card>

          <div className="col-span-12 grid grid-cols-3 gap-3">
            <Counter label="Активних відгуків" value={data.activeCount} hint="Відкрити вакансії" onClick={() => navigate('/jobs/applications')} />
            <Counter label="Оферів" value={data.offers} accent={data.offers > 0} hint="Переглянути" onClick={() => navigate('/jobs/applications')} />
            <Counter
              label="Питань до повторення"
              value={data.questionsDue}
              hint={data.questionsDue ? 'Почати тренування' : 'Банк питань'}
              onClick={() => navigate(data.questionsDue ? '/jobs/questions/practice' : '/jobs/questions')}
            />
          </div>

          <Card className="col-span-6">
            <CardHeader>
              <CardTitle>Найближчі співбесіди й тестові</CardTitle>
              <CardAction>
                <Button variant="subtle" size="xs" onClick={() => navigate('/calendar')}>
                  Календар
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.upcoming.length === 0 ? (
                <p className="text-body text-muted-foreground">Нічого не заплановано. Додайте етап у вакансії — він одразу з’явиться в календарі.</p>
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
                              {s.kind === 'test_task' && s.deadlineAt ? ' · здати до терміну' : ''}
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
              <CardTitle>Нагадати про себе</CardTitle>
              <CardDescription>Настав час нагадування або немає відповіді тиждень.</CardDescription>
              <CardAction>
                <Button variant="subtle" size="xs" onClick={() => navigate('/freelance/templates?situation=follow_up')}>
                  Шаблони
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.followUps.length === 0 ? (
                <p className="text-body text-muted-foreground">Нікого не треба наздоганяти.</p>
              ) : (
                <ItemGroup className="gap-1.5">
                  {data.followUps.slice(0, 8).map((a) => (
                    <Item key={a.id} asChild size="xs" className="cursor-pointer bg-card hover:ring-1 hover:ring-border">
                      <button type="button" className="w-full text-left" onClick={() => navigate(ENTITY_META.application.route(a.id))}>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="w-full truncate font-normal">{a.title}</ItemTitle>
                          <ItemDescription className="truncate text-meta">
                            {a.company || 'Компанію не вказано'}
                            {a.appliedAt ? ` · надіслано ${fmtDay(a.appliedAt)}` : ''}
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
