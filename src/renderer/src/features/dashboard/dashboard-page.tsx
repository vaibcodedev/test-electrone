import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ArrowRight, BookOpen, CircleAlert, Pause, Pin, Star, Timer, X } from 'lucide-react'
import { Bar, BarChart, XAxis } from 'recharts'
import { ENTITY_META } from '@shared/entity-types'
import type { DueCard } from '@shared/domain/boards'
import type { CalendarItem } from '@shared/domain/calendar'
import type { QuickAddTarget } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtDay, fmtDayFull, fmtMinutes, fmtRelative, plural, capitalize } from '@/lib/format'
import { clickableProps } from '@/lib/clickable'
import { useUi } from '@/stores/ui-store'
import { EntityRow } from '@/components/common/entity-link'
import { SegmentBar } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { ENTITY_ICON } from '@/app/navigation'
import { PRIORITY_DOT } from '@/modules/boards/labels'
import { LoadError } from '@/features/route-error'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const TODAY_LIMIT = 6
const AGENDA_LIMIT = 5

/** Clickable Item row that navigates inside the app. */
function RowLink({
  to,
  className,
  children
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <Item asChild size="xs" className={cn('cursor-pointer', className)}>
      <button type="button" className="w-full text-left" onClick={() => navigate(to)}>
        {children}
      </button>
    </Item>
  )
}

function TodayCard({ cards, overdue }: { cards: DueCard[]; overdue: DueCard[] }) {
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
      {all.length > 0 && <SegmentBar value={done} total={all.length} segments={Math.min(all.length, 8)} className="mt-4 text-ink-foreground" />}
      <ItemGroup className="mt-5 gap-0.5">
        {open.slice(0, TODAY_LIMIT).map((c) => {
          const late = c.dueAt! < todayStart
          return (
            <RowLink key={c.id} to={ENTITY_META.card.route(c.id)} className="rounded-xl text-ink-foreground hover:bg-ink-foreground/8">
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
                <span className="max-w-[40%] min-w-0 truncate text-caption text-ink-muted" title={c.boardTitle}>
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
          className="mt-2 self-start bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15"
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

/** «сьогодні»/«завтра» first; later days this week by weekday («пʼятниця» fits 64px, «27 листопада» wraps). */
function agendaDay(ts: number): string {
  const days = differenceInCalendarDays(ts, new Date())
  return days >= 2 && days <= 6 ? format(ts, 'EEEE', { locale: LOCALE }) : fmtDay(ts)
}

function Agenda({ items }: { items: CalendarItem[] }) {
  const navigate = useNavigate()
  return (
    <Card className="col-span-5">
      <CardHeader>
        <CardTitle>Найближчі 3 дні</CardTitle>
        <CardAction>
          <Button variant="subtle" size="xs" onClick={() => navigate('/calendar')}>
            Календар
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-body text-muted-foreground">Подій немає. Додайте зустріч або нагадування в календарі.</p>
        ) : (
          <ItemGroup className="gap-1.5">
            {items.slice(0, AGENDA_LIMIT).map((i) => (
              <RowLink key={i.key} to={ENTITY_META[i.ref.type].route(i.ref.id)} className="bg-card hover:ring-1 hover:ring-border">
                {/* Date block (design-system §10): the feed spans 3 days, a bare «15:00» hid which day it is. */}
                <div
                  className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-xl bg-surface py-1.5 text-center"
                  title={fmtDayFull(i.startAt)}
                >
                  <span className="text-meta leading-tight text-muted-foreground">{agendaDay(i.startAt)}</span>
                  {!i.allDay && (
                    <span className="text-lead leading-tight font-semibold tabular-nums">{format(i.startAt, 'HH:mm')}</span>
                  )}
                </div>
                <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: i.color ?? 'var(--chart-bar)' }} />
                <ItemContent className="min-w-0">
                  <ItemTitle className={cn('w-full truncate font-normal', i.done && 'text-muted-foreground line-through')}>
                    {i.title}
                  </ItemTitle>
                </ItemContent>
              </RowLink>
            ))}
          </ItemGroup>
        )}
        {items.length > AGENDA_LIMIT && (
          <Button variant="subtle" size="xs" className="mt-2" onClick={() => navigate('/calendar')}>
            Ще {items.length - AGENDA_LIMIT} <ArrowRight />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

const QUICK: { target: QuickAddTarget; label: string; type: keyof typeof ENTITY_META }[] = [
  { target: 'idea', label: 'Записати ідею', type: 'idea' },
  { target: 'card', label: 'Нове завдання', type: 'card' },
  { target: 'snippet', label: 'Зберегти сніпет', type: 'snippet' },
  { target: 'word', label: 'Нове слово', type: 'word' }
]

function QuickTiles() {
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  return (
    <div className="col-span-6 grid grid-cols-2 gap-3">
      {QUICK.map((q) => {
        const Icon = ENTITY_ICON[q.type]
        return (
          <Card
            key={q.target}
            {...clickableProps(() => setQuickAddOpen(true, q.target))}
            className="tile h-[118px] justify-between gap-0 rounded-3xl p-4"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-foreground/[0.07]">
              <Icon className="size-4 text-muted-foreground" />
            </span>
            <span className="text-lead leading-tight font-medium">{q.label}</span>
          </Card>
        )
      })}
    </div>
  )
}

function TimerTile({
  timer,
  weekMinutes
}: {
  timer: { projectTitle: string; startedAt: number; projectId: string } | null
  weekMinutes: number
}) {
  const stop = useApiMutation('time', 'stop', { successMessage: 'Таймер зупинено' })
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [timer])
  const elapsed = timer ? Math.max(0, Math.floor((now - timer.startedAt) / 60_000)) : 0
  return (
    <Card className={cn('col-span-3 justify-between', timer && 'bg-lime text-lime-foreground')}>
      <CardHeader>
        <CardTitle className={cn(timer && 'text-lime-foreground')}>Час</CardTitle>
        <CardAction>
          <Timer className="size-4 opacity-60" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {timer ? (
          <>
            <div>
              <div className="font-display text-stat leading-none tabular-nums">{fmtMinutes(elapsed)}</div>
              <Button
                variant="link"
                className="mt-1 text-caption font-normal text-lime-foreground/75"
                onClick={() => navigate(`/projects/${timer.projectId}`)}
              >
                {timer.projectTitle}
              </Button>
            </div>
            <Button
              disabled={stop.isPending}
              onClick={() => stop.mutate(undefined)}
              className="bg-lime-foreground text-lime hover:bg-lime-foreground/90"
            >
              <Pause /> Зупинити
            </Button>
          </>
        ) : weekMinutes === 0 ? (
          // A stat tile without data says so in words (§8), not with a big «0 хв».
          <>
            <p className="text-body leading-relaxed text-muted-foreground">
              Цього тижня час ще не засікали — таймер запускається в контракті.
            </p>
            <Button variant="subtle" size="xs" className="self-start" onClick={() => navigate('/clients')}>
              До контрактів <ArrowRight />
            </Button>
          </>
        ) : (
          <div>
            <div className="font-display text-stat leading-none">{fmtMinutes(weekMinutes)}</div>
            <div className="mt-1 text-caption text-muted-foreground">за цей тиждень</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EnglishTile({ due, word }: { due: number; word: { id: string; term: string; translation: string } | null }) {
  const navigate = useNavigate()
  return (
    <Card className="col-span-3 justify-between">
      <CardHeader>
        <CardTitle>Слово дня</CardTitle>
        {due > 0 && (
          <CardAction>
            <Button variant="subtle" size="xs" onClick={() => navigate('/english/review')}>
              {due} на повторення <ArrowRight />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {word ? (
          <Button
            variant="link"
            className="flex-col items-start gap-1 text-left whitespace-normal no-underline"
            onClick={() => navigate(ENTITY_META.word.route(word.id))}
          >
            <span className="font-display text-headline leading-tight">{word.term}</span>
            <span className="text-body font-normal text-muted-foreground">{word.translation}</span>
          </Button>
        ) : (
          <p className="text-body text-muted-foreground">Додайте слова з робочого листування — тут щодня буде одне.</p>
        )}
      </CardContent>
    </Card>
  )
}

const activityConfig = { count: { label: 'Зроблено', color: 'var(--chart-1)' } } satisfies ChartConfig

/** Single series → one validated hue, no legend; exact values on hover (dataviz skill). */
function Activity({ data }: { data: { day: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const rows = data.map((d) => ({ ...d, label: fmtDayFull(parseISO(d.day).getTime()) }))
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Зроблено за 2 тижні</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {total === 0 ? (
          // Fourteen identical stub bars read as a decorative dashed line: say it in words instead.
          <p className="text-body leading-relaxed text-muted-foreground">
            За два тижні ще нічого не закрито — перетягніть картку в колонку «Готово».
          </p>
        ) : (
          <>
            <div className="font-display text-stat leading-none tabular-nums">{total}</div>
            <ChartContainer config={activityConfig} className="aspect-auto h-28 w-full">
              <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
                <XAxis dataKey="label" hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ListCard({
  title,
  action,
  children,
  className
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const GUIDE_HINT_KEY = 'vault-guide-hint-dismissed'

/** First-run hint pointing to the guide; dismissed forever via localStorage. */
function GuideHint() {
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(() => localStorage.getItem(GUIDE_HINT_KEY) === '1')
  if (hidden) return null
  const dismiss = (): void => {
    localStorage.setItem(GUIDE_HINT_KEY, '1')
    setHidden(true)
  }
  return (
    <Card className="col-span-12 flex-row items-center gap-4 bg-lime-soft px-5 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card">
        <BookOpen className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-lead font-medium">Уперше тут?</div>
        <div className="text-body text-muted-foreground">
          Гайд на кілька хвилин: розділи, гарячі клавіші й де лежать ваші дані.
        </div>
      </div>
      <Button variant="soft" onClick={() => navigate('/guide')}>
        Відкрити гайд
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Сховати підказку" onClick={dismiss}>
        <X />
      </Button>
    </Card>
  )
}

export function DashboardPage() {
  const { data, isError, refetch } = useApi('app', 'dashboard', undefined, { refetchInterval: 60_000 })
  const navigate = useNavigate()
  if (!data && isError) return <LoadError title="Не вдалося завантажити головну" onRetry={() => void refetch()} />
  // Same shape as the route skeleton (handle.skeleton = 'dashboard'): no jump between the two.
  if (!data) return <PageSkeleton kind="dashboard" />
  const pinned = [
    ...data.pinned,
    ...data.favorites.filter((f) => !data.pinned.some((p) => p.type === f.type && p.id === f.id))
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="stagger grid grid-cols-12 gap-3">
        <GuideHint />
        <TodayCard cards={data.today.cards} overdue={data.today.overdue} />
        <Agenda items={data.today.agenda} />

        <QuickTiles />
        <TimerTile timer={data.timer} weekMinutes={data.weekMinutes} />
        <EnglishTile due={data.english.due} word={data.english.wordOfDay} />

        <ListCard title="Закріплено" className="col-span-4">
          {pinned.length ? (
            <div className="-mx-2.5 flex flex-col">
              {pinned.slice(0, 7).map((p) => (
                <EntityRow
                  key={`${p.kind}:${p.type}:${p.id}`}
                  item={p}
                  trailing={
                    p.kind === 'pin' ? (
                      <Pin className="size-3.5 text-muted-foreground" />
                    ) : (
                      <Star className="size-3.5 text-muted-foreground" />
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-body text-muted-foreground">Натисніть шпильку в будь-якому записі, щоб він з’явився тут.</p>
          )}
        </ListCard>

        <ListCard title="Нещодавно змінювалось" className="col-span-4">
          <div className="-mx-2.5 flex flex-col">
            {data.recent.slice(0, 7).map((r) => (
              <EntityRow
                key={`${r.type}:${r.id}`}
                item={r}
                trailing={<span className="text-meta text-muted-foreground">{fmtRelative(r.updatedAt)}</span>}
              />
            ))}
            {!data.recent.length && (
              <p className="px-2.5 text-body leading-relaxed text-muted-foreground">
                Тут з’являться записи, які ви змінювали останніми.
              </p>
            )}
          </div>
        </ListCard>

        <Activity data={data.activity} />

        <ListCard
          title="Ідеї у вхідних"
          className="col-span-6"
          action={
            <Button variant="subtle" size="xs" onClick={() => navigate('/ideas')}>
              Усі ідеї
            </Button>
          }
        >
          {data.inboxIdeas.length ? (
            <div className="flex flex-wrap gap-2">
              {data.inboxIdeas.map((i) => (
                <Button
                  key={i.id}
                  variant="soft"
                  size="sm"
                  className="max-w-full bg-card font-normal hover:ring-1 hover:ring-border"
                  title={i.title}
                  onClick={() => navigate(ENTITY_META.idea.route(i.id))}
                >
                  <span className="truncate">{i.title}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-body text-muted-foreground">
              Вхідні порожні. Глобальна клавіша швидкого додавання працює навіть із трею.
            </p>
          )}
        </ListCard>

        <ListCard title="Читаю зараз" className="col-span-6">
          {data.reading.length ? (
            <ItemGroup className="gap-2">
              {data.reading.map((b) => (
                <RowLink key={b.id} to={ENTITY_META.bookmark.route(b.id)} className="bg-card">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate font-normal">{b.title}</ItemTitle>
                  </ItemContent>
                  <Progress value={b.progress} className="h-1.5 w-20 bg-surface [&>[data-slot=progress-indicator]]:bg-chart-1" />
                </RowLink>
              ))}
            </ItemGroup>
          ) : (
            <p className="text-body text-muted-foreground">Позначте закладку «читаю» — прогрес буде тут.</p>
          )}
        </ListCard>
      </div>
    </div>
  )
}
