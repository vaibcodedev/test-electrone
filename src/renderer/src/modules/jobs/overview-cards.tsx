import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { openUrl } from '@/lib/open-url'
import { format } from 'date-fns'
import { BellRing, ExternalLink, Flame } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { DailyBoard, JobsOverview } from '@shared/domain/jobs'
import { useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtDay, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/common/page'
import { IconAction } from '@/components/common/icon-action'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DailyHeatmap } from './daily-heatmap'
import { STAGE_KIND_LABEL } from './labels'
import { BoardDot } from './board-label'
import { StageDate } from './stage-row'

function TodayRow({ board }: { board: DailyBoard }): ReactElement {
  const checkin = useApiMutation('jobs', 'checkin')
  const t = board.today
  const target = board.dailyTarget
  // Met by applications alone: the mark is set and locked — say why instead of a dead checkbox.
  const auto = t.done && !t.checked
  const checkbox = (
    <Checkbox
      id={`board-${board.id}`}
      checked={t.checked || t.done}
      disabled={auto}
      onCheckedChange={(v) => checkin.mutate({ boardId: board.id, day: t.day, checked: v === true })}
      aria-label={`Позначити ${board.name} на сьогодні`}
      className="size-5 rounded-full"
    />
  )
  return (
    <Item variant="muted" size="sm" className={cn(t.done && 'bg-chart-1/12')}>
      {auto ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{checkbox}</span>
          </TooltipTrigger>
          <TooltipContent>
            Зараховано автоматично: {t.applied} з {target} {plural(target, ['відгуку', 'відгуків', 'відгуків'])}
          </TooltipContent>
        </Tooltip>
      ) : (
        checkbox
      )}
      <ItemContent className="min-w-0">
        <ItemTitle className="flex items-center gap-2">
          <BoardDot color={board.color} />
          {board.name}
        </ItemTitle>
        <ItemDescription className="text-caption">
          {target > 0
            ? `${t.applied} з ${target} ${plural(target, ['відгуку', 'відгуків', 'відгуків'])}`
            : t.applied
              ? `${t.applied} ${plural(t.applied, ['відгук', 'відгуки', 'відгуків'])}`
              : 'просто перевірити'}
          {t.checked && !t.applied ? ' · перевірено, підхожих немає' : ''}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {board.streak > 0 && (
          <Badge variant="soft" className="bg-card font-normal">
            <Flame className="text-warn" /> {board.streak}
          </Badge>
        )}
        {board.url && (
          <IconAction label={`Відкрити ${board.name}`} onClick={() => openUrl(board.url)}>
            <ExternalLink />
          </IconAction>
        )}
      </ItemActions>
    </Item>
  )
}

/** «Сьогодні»: the boards expected today with their marks, plus the evening reminder. */
export function TodayCard({ today }: { today: DailyBoard[] }): ReactElement {
  const navigate = useNavigate()
  const { data: settings } = useApi('settings', 'get')
  const expected = today.filter((b) => b.today.expected)
  const pending = expected.filter((b) => !b.today.done)
  const reminder = settings?.jobReminderTime
  return (
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
        {today.length === 0 ? (
          <EmptyState
            title="Майданчиків поки немає"
            hint="Додайте Djinni, DOU, LinkedIn і задайте норму відгуків на день."
            action={
              <Button variant="subtle" onClick={() => navigate('/jobs/boards')}>
                Додати майданчик
              </Button>
            }
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
  )
}

/** Heatmap of the last four weeks of the board habit. */
export function HabitCard({ today }: { today: DailyBoard[] }): ReactElement {
  return (
    <Card className="col-span-7">
      <CardHeader>
        <CardTitle>Останні 4 тижні</CardTitle>
        <CardDescription>Відгук зараховується сам; позначка закриває день, якщо підхожих вакансій не було.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <DailyHeatmap boards={today} />
      </CardContent>
    </Card>
  )
}

export function UpcomingCard({ upcoming }: { upcoming: JobsOverview['upcoming'] }): ReactElement {
  const navigate = useNavigate()
  return (
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
        {upcoming.length === 0 ? (
          <p className="text-body text-muted-foreground">Нічого не заплановано. Додайте етап у вакансії — він одразу з’явиться в календарі.</p>
        ) : (
          <ItemGroup className="gap-1.5">
            {upcoming.map((s) => {
              const kind = STAGE_KIND_LABEL[s.kind]
              const stage = s.title && s.title !== kind ? s.title : null
              return (
                <Item key={s.id} asChild size="sm" className="cursor-pointer gap-3 bg-card p-2.5 pr-4 hover:ring-1 hover:ring-border">
                  <button type="button" className="w-full text-left" onClick={() => navigate(ENTITY_META.application.route(s.applicationId))}>
                    <StageDate when={s.at ?? s.deadlineAt} withTime={!!s.at} />
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
  )
}

export function FollowUpsCard({ followUps }: { followUps: JobsOverview['followUps'] }): ReactElement {
  const navigate = useNavigate()
  return (
    <Card className="col-span-6">
      <CardHeader>
        <CardTitle>Нагадати про себе</CardTitle>
        <CardDescription>Настав час нагадування або немає відповіді тиждень.</CardDescription>
        <CardAction>
          <Button variant="subtle" size="xs" onClick={() => navigate('/freelance/templates?situation=follow_up')}>
            Шаблони нагадувань
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {followUps.length === 0 ? (
          <p className="text-body text-muted-foreground">Нікого не треба наздоганяти.</p>
        ) : (
          <ItemGroup className="gap-1.5">
            {followUps.slice(0, 8).map((a) => (
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
  )
}
