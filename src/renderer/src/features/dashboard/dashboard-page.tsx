import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { ArrowUpRight, BookOpen, Pause, Pin, Star, Timer, X } from 'lucide-react'
import { Bar, BarChart, XAxis } from 'recharts'
import { ENTITY_META } from '@shared/entity-types'
import type { DueCard } from '@shared/domain/boards'
import type { CalendarItem } from '@shared/domain/calendar'
import type { QuickAddTarget } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtMinutes, fmtRelative, plural } from '@/lib/format'
import { useUi } from '@/stores/ui-store'
import { EntityRow } from '@/components/common/entity-link'
import { SegmentBar } from '@/components/common/page'
import { ENTITY_ICON } from '@/app/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-destructive',
  high: 'bg-warn',
  medium: 'bg-info',
  low: 'bg-ink-muted',
  none: 'bg-transparent'
}

/** Clickable Item row that navigates inside the app. */
function NavItem({
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
  return (
    <Card className="col-span-7 min-h-[300px] gap-0 bg-ink p-6 text-ink-foreground">
      <div className="flex items-center justify-between text-caption text-ink-muted">
        <span>{capitalize(format(new Date(), 'EEEE, d MMMM', { locale: LOCALE }))}</span>
        {all.length > 0 && (
          <Badge variant="lime">
            {done}/{all.length}
          </Badge>
        )}
      </div>
      <h2 className="font-display mt-3 text-[40px] leading-[0.98]">
        {open.length
          ? `${open.length} ${plural(open.length, ['задача', 'задачи', 'задач'])} на сегодня`
          : all.length
            ? 'Всё сделано'
            : 'Свободный день'}
      </h2>
      {all.length > 0 && <SegmentBar value={done} total={all.length} segments={6} className="mt-4 text-ink-foreground" />}
      <ItemGroup className="mt-5 gap-0.5">
        {open.slice(0, 6).map((c) => {
          const late = c.dueAt! < todayStart
          return (
            <NavItem key={c.id} to={ENTITY_META.card.route(c.id)} className="rounded-xl text-ink-foreground hover:bg-ink-foreground/8">
              <ItemMedia>
                <span className={cn('size-2 rounded-full', PRIORITY_DOT[c.priority])} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full truncate text-lead font-normal">{c.title}</ItemTitle>
              </ItemContent>
              <span className={cn('shrink-0 text-caption', late ? 'text-destructive' : 'text-ink-muted')}>
                {late ? 'просрочено' : c.boardTitle}
              </span>
            </NavItem>
          )
        })}
      </ItemGroup>
      {!all.length && (
        <p className="mt-4 max-w-sm text-body text-ink-muted">
          Поставьте дедлайн карточке на доске — она появится здесь в нужный день.
        </p>
      )}
    </Card>
  )
}

function Agenda({ items }: { items: CalendarItem[] }) {
  const navigate = useNavigate()
  return (
    <Card className="col-span-5">
      <CardHeader>
        <CardTitle>Ближайшие 3 дня</CardTitle>
        <CardAction>
          <Button variant="subtle" size="xs" onClick={() => navigate('/calendar')}>
            Календарь
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-body text-muted-foreground">Событий нет. Добавьте встречу или напоминание в календаре.</p>
        ) : (
          <ItemGroup className="gap-2">
            {items.slice(0, 7).map((i) => (
              <NavItem key={i.key} to={ENTITY_META[i.ref.type].route(i.ref.id)} className="bg-card hover:ring-1 hover:ring-border">
                <span className="w-14 shrink-0 text-caption text-muted-foreground tabular-nums">
                  {i.allDay ? format(i.startAt, 'd MMM', { locale: LOCALE }) : format(i.startAt, 'HH:mm')}
                </span>
                <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: i.color ?? 'var(--chart-bar)' }} />
                <ItemContent className="min-w-0">
                  <ItemTitle className={cn('w-full truncate font-normal', i.done && 'text-muted-foreground line-through')}>
                    {i.title}
                  </ItemTitle>
                </ItemContent>
              </NavItem>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

const QUICK: { target: QuickAddTarget; label: string; type: keyof typeof ENTITY_META }[] = [
  { target: 'idea', label: 'Записать идею', type: 'idea' },
  { target: 'card', label: 'Новая задача', type: 'card' },
  { target: 'snippet', label: 'Сохранить сниппет', type: 'snippet' },
  { target: 'word', label: 'Новое слово', type: 'word' }
]

function QuickTiles() {
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  return (
    <div className="col-span-6 grid grid-cols-2 gap-3">
      {QUICK.map((q, i) => {
        const Icon = ENTITY_ICON[q.type]
        const inverted = i === 3
        return (
          <Button
            key={q.target}
            variant="soft"
            onClick={() => setQuickAddOpen(true, q.target)}
            className={cn(
              'group h-[118px] flex-col items-stretch justify-between rounded-3xl p-4 text-left whitespace-normal',
              inverted && 'bg-ink text-ink-foreground hover:bg-ink/90'
            )}
          >
            <span className="flex items-center justify-between">
              <span className={cn('grid size-9 place-items-center rounded-full', inverted ? 'bg-ink-foreground/10' : 'bg-card')}>
                <ArrowUpRight className="transition-transform group-hover:rotate-45" />
              </span>
              <Icon className={inverted ? 'text-ink-accent' : 'text-muted-foreground'} />
            </span>
            <span className="text-lead leading-tight font-medium">{q.label}</span>
          </Button>
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
  const stop = useApiMutation('time', 'stop', { successMessage: 'Таймер остановлен' })
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
        <CardTitle className={cn(timer && 'text-lime-foreground')}>Время</CardTitle>
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
            <Button onClick={() => stop.mutate(undefined)} className="bg-lime-foreground text-lime hover:bg-lime-foreground/90">
              <Pause /> Остановить
            </Button>
          </>
        ) : (
          <div>
            <div className="font-display text-stat leading-none">{fmtMinutes(weekMinutes)}</div>
            <div className="mt-1 text-caption text-muted-foreground">за эту неделю</div>
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
            <Button size="xs" onClick={() => navigate('/english/review')}>
              {due} на повтор
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
            <span className="font-display text-[26px] leading-tight">{word.term}</span>
            <span className="text-body font-normal text-muted-foreground">{word.translation}</span>
          </Button>
        ) : (
          <p className="text-body text-muted-foreground">Добавьте слова из рабочей переписки — здесь будет одно каждый день.</p>
        )}
      </CardContent>
    </Card>
  )
}

const activityConfig = { count: { label: 'Сделано', color: 'var(--chart-1)' } } satisfies ChartConfig

/** Single series → one validated hue, no legend; exact values on hover (dataviz skill). */
function Activity({ data }: { data: { day: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const rows = data.map((d) => ({ ...d, label: format(new Date(d.day), 'd MMM', { locale: LOCALE }) }))
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Сделано за 2 недели</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="font-display text-stat leading-none">{total}</div>
        <ChartContainer config={activityConfig} className="aspect-auto h-28 w-full">
          <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
            <XAxis dataKey="label" hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} minPointSize={3} />
          </BarChart>
        </ChartContainer>
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
        <div className="text-lead font-medium">Впервые здесь?</div>
        <div className="text-body text-muted-foreground">
          Гайд за пару минут: разделы, горячие клавиши и где лежат ваши данные.
        </div>
      </div>
      <Button variant="default" onClick={() => navigate('/guide')}>
        Открыть гайд
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Скрыть подсказку" onClick={dismiss}>
        <X />
      </Button>
    </Card>
  )
}

export function DashboardPage() {
  const { data } = useApi('app', 'dashboard', undefined, { refetchInterval: 60_000 })
  const navigate = useNavigate()
  if (!data) {
    return (
      <div className="grid grid-cols-12 gap-3 p-6">
        <Skeleton className="col-span-7 h-[300px] rounded-3xl" />
        <Skeleton className="col-span-5 h-[300px] rounded-3xl" />
      </div>
    )
  }
  const pinned = [
    ...data.pinned,
    ...data.favorites.filter((f) => !data.pinned.some((p) => p.type === f.type && p.id === f.id))
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="grid animate-rise grid-cols-12 gap-3">
        <GuideHint />
        <TodayCard cards={data.today.cards} overdue={data.today.overdue} />
        <Agenda items={data.today.agenda} />

        <QuickTiles />
        <TimerTile timer={data.timer} weekMinutes={data.weekMinutes} />
        <EnglishTile due={data.english.due} word={data.english.wordOfDay} />

        <ListCard title="Закреплено" className="col-span-4">
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
            <p className="text-body text-muted-foreground">Нажмите на булавку у любой записи, чтобы она появилась здесь.</p>
          )}
        </ListCard>

        <ListCard title="Недавно менялось" className="col-span-4">
          <div className="-mx-2.5 flex flex-col">
            {data.recent.slice(0, 7).map((r) => (
              <EntityRow
                key={`${r.type}:${r.id}`}
                item={r}
                trailing={<span className="text-meta text-muted-foreground">{fmtRelative(r.updatedAt)}</span>}
              />
            ))}
            {!data.recent.length && <p className="px-2.5 text-body text-muted-foreground">Пока пусто.</p>}
          </div>
        </ListCard>

        <Activity data={data.activity} />

        <ListCard
          title="Идеи во входящих"
          className="col-span-6"
          action={
            <Button variant="subtle" size="xs" onClick={() => navigate('/ideas')}>
              Все идеи
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
                  onClick={() => navigate(ENTITY_META.idea.route(i.id))}
                >
                  <span className="truncate">{i.title}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-body text-muted-foreground">
              Входящие пусты. Глобальная клавиша быстрого добавления работает даже из трея.
            </p>
          )}
        </ListCard>

        <ListCard title="Читаю сейчас" className="col-span-6">
          {data.reading.length ? (
            <ItemGroup className="gap-2">
              {data.reading.map((b) => (
                <NavItem key={b.id} to={ENTITY_META.bookmark.route(b.id)} className="bg-card">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate font-normal">{b.title}</ItemTitle>
                  </ItemContent>
                  <Progress value={b.progress} className="h-1.5 w-20 bg-surface [&>[data-slot=progress-indicator]]:bg-chart-1" />
                </NavItem>
              ))}
            </ItemGroup>
          ) : (
            <p className="text-body text-muted-foreground">Отметьте закладку «читаю» — прогресс будет здесь.</p>
          )}
        </ListCard>
      </div>
    </div>
  )
}
