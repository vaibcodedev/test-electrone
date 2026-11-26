import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { addDays, startOfWeek } from 'date-fns'
import {
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  NotebookPen,
  SquareKanban
} from 'lucide-react'
import type { Currency } from '@shared/domain/crm'
import {
  reviewNotesSchema,
  type WeekMetric,
  type WeekSection,
  type WeekSnapshot
} from '@shared/domain/review'
import { planTasks } from '@shared/plan-tasks'
import { limitsOf } from '@/lib/limits'
import { KEEP_PERIOD, useApi, useApiMutation, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import {
  dayKey,
  fmtHours,
  fmtMinutes,
  fmtMoneyCompact,
  fmtPercent,
  fmtWeekRange,
  plural
} from '@/lib/format'
import { moneyEntries } from '@/lib/money'
import { flushAllAutosaves, useAutosave } from '@/hooks/use-autosave'
import { useHotkey } from '@/hooks/use-hotkey'
import { useNavVisibility } from '@/hooks/use-nav-visibility'
import { cn } from '@/lib/utils'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { EntityRow } from '@/components/common/entity-link'
import { MarkdownField } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MoneyLines } from '@/components/common/money-value'
import { StatTile } from '@/components/common/stat-tile'
import { CardEmptyText, ListCard } from '@/components/common/list-card'
import { EventDate } from '@/components/common/event-date'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { visibleSnapshot } from './visible'
import { PlanCardsDialog } from './plan-cards-dialog'

const NOTES_L = limitsOf(reviewNotesSchema)
const currentWeekKey = (): string => dayKey(startOfWeek(new Date(), { weekStartsOn: 1 }))
const parseKey = (key: string): Date => new Date(`${key}T00:00:00`)

/** «23–29 листопада» for the week starting on `key`. */
const weekLabel = (key: string): string => fmtWeekRange(parseKey(key), addDays(parseKey(key), 6))

/** Tile and badge value: time is compact («1,1 год», never two lines in a narrow tile); `exact` — «1 год 3 хв». */
function fmtValue(m: Pick<WeekMetric, 'unit'>, v: number, exact = false): string {
  if (m.unit === 'minutes') return exact ? fmtMinutes(v) : fmtHours(v)
  if (m.unit === 'percent') return fmtPercent(v)
  return String(v)
}

/** «Пунктів чек-листів»: a hyphenated word never breaks at its hyphen («чек-» / «листів»). */
function keepHyphenated(text: string): ReactNode {
  return text.split(/(\S+-\S+)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    )
  )
}

/**
 * Metric tiles of a section by the card's own width: one row when every tile gets room, otherwise rows of equal
 * tiles with no hole (5 → 3 + 2 on a 6-column grid). Static classes: Tailwind only sees literal class names.
 */
function metricLayout(n: number): { grid: string; tile: (i: number) => string } {
  if (n === 5)
    return {
      grid: 'grid-cols-6 @2xl:grid-cols-5',
      tile: (i) => (i < 3 ? 'col-span-2 @2xl:col-span-1' : 'col-span-3 @2xl:col-span-1')
    }
  if (n === 4) return { grid: 'grid-cols-2 @md:grid-cols-4', tile: () => '' }
  if (n === 3) return { grid: 'grid-cols-3', tile: () => '' }
  if (n === 2) return { grid: 'grid-cols-2', tile: () => '' }
  return { grid: 'grid-cols-1', tile: () => '' }
}

/** «12 задач, 1 040 $ на руки, 3 собеседования» — a one-line story of the week. */
function headline(s: WeekSnapshot): string {
  const metric = (key: string): number =>
    s.sections.flatMap((x) => x.metrics).find((m) => m.key === key)?.value ?? 0
  const parts: string[] = []
  const cards = metric('cardsDone')
  if (cards) parts.push(`${cards} ${plural(cards, ['завдання', 'завдання', 'завдань'])}`)
  const net = Object.entries(s.money.net).find(([, v]) => (v ?? 0) > 0)
  // Compact like the «На руки» tile below («100 млн USD»); the exact sum is in that tile's tooltip.
  if (net) parts.push(`${fmtMoneyCompact(net[1] ?? 0, net[0] as Currency)} на руки`)
  const interviews = metric('interviews')
  if (interviews)
    parts.push(`${interviews} ${plural(interviews, ['співбесіда', 'співбесіди', 'співбесід'])}`)
  const sent = metric('proposals') + metric('applications')
  if (sent) parts.push(`${sent} ${plural(sent, ['відгук', 'відгуки', 'відгуків'])}`)
  const minutes = metric('minutes')
  if (!cards && minutes) parts.push(`${fmtMinutes(minutes)} роботи`)
  // Non-breaking spaces keep "1 собеседование" on one line; lines break only between facts.
  return parts.length
    ? parts
        .slice(0, 3)
        .map((p) => p.replace(/ /g, ' '))
        .join(', ')
    : 'Тихий тиждень'
}

function Delta({ m }: { m: WeekMetric }) {
  const diff = m.value - m.previous
  if (diff === 0) {
    return (
      <Badge variant="soft" className="text-muted-foreground">
        <Minus /> як минулого
      </Badge>
    )
  }
  const good = m.better === 'up' ? diff > 0 : diff < 0
  const Icon = diff > 0 ? ArrowUp : ArrowDown
  // A bare «↑ 4» says nothing to a screen reader: the badge is focusable and carries the whole phrase.
  const phrase = `На ${fmtValue(m, Math.abs(diff), true)} ${diff > 0 ? 'більше' : 'менше'}, ніж минулого тижня (${fmtValue(m, m.previous, true)})`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          aria-label={phrase}
          variant={good ? 'success' : 'soft'}
          className={cn(!good && 'text-muted-foreground')}
        >
          <Icon aria-hidden />
          {fmtValue(m, Math.abs(diff))}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{phrase}</TooltipContent>
    </Tooltip>
  )
}

const isEmpty = (section: WeekSection): boolean =>
  section.metrics.every((m) => !m.value && !m.previous)

/** Up to this many metrics a section takes half a row; more get the whole row. */
const HALF_MAX = 4

/**
 * Half-width sections pair up two per row; a section with more metrics takes a full row, and so does the last
 * half-width one when it would be left alone — every row is filled and its cards are of one height.
 */
function wideSections(sections: WeekSection[]): Set<string> {
  const wide = new Set(sections.filter((s) => s.metrics.length > HALF_MAX).map((s) => s.id))
  const half = sections.filter((s) => !wide.has(s.id))
  if (half.length % 2) wide.add(half[half.length - 1].id)
  return wide
}

function SectionCard({ section, wide }: { section: WeekSection; wide: boolean }) {
  const layout = metricLayout(section.metrics.length)
  return (
    <Card className={cn(wide && 'col-span-2')}>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
      </CardHeader>
      <CardContent className="@container">
        <div className={cn('grid gap-3', layout.grid)}>
          {section.metrics.map((m, i) => (
            <div
              key={m.key}
              className={cn('flex flex-col gap-1.5 rounded-2xl bg-card p-3', layout.tile(i))}
            >
              {/* Two label lines and a fixed delta slot: numbers of neighbouring tiles stay on one line. */}
              <span className="line-clamp-2 min-h-[2lh] text-caption text-muted-foreground">
                {keepHyphenated(m.label)}
              </span>
              <span
                className="font-display text-headline leading-[1.1] whitespace-nowrap tabular-nums"
                title={m.unit === 'minutes' ? fmtValue(m, m.value, true) : undefined}
              >
                {fmtValue(m, m.value)}
              </span>
              <div className="mt-auto h-5">
                {(m.value !== 0 || m.previous !== 0) && <Delta m={m} />}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const hasMoney = (money: WeekSnapshot['money']): boolean =>
  [money.net, money.expenses, money.profit].some((v) => moneyEntries(v).length > 0)

function MoneyCard({ money }: { money: WeekSnapshot['money'] }) {
  return (
    <div className="col-span-12 grid grid-cols-3 gap-3">
      <StatTile
        label="На руки"
        value={<MoneyLines value={money.net} compact emptyLabel="ще немає надходжень" />}
      />
      <StatTile
        label="Витрати"
        value={<MoneyLines value={money.expenses} compact emptyLabel="ще немає витрат" />}
      />
      <StatTile
        label="Прибуток за тиждень"
        tone="ink"
        value={
          <MoneyLines value={money.profit} compact tone="ink" emptyLabel="ще немає прибутку" />
        }
      />
    </div>
  )
}

function Notes({ weekStart, summary, plan }: { weekStart: string; summary: string; plan: string }) {
  const save = useApiMutation('review', 'saveNotes', { silent: false })
  const [s, setS] = useAutosave(summary, (next) => save.mutate({ weekStart, summary: next }))
  const [p, setP] = useAutosave(plan, (next) => save.mutate({ weekStart, plan: next }))
  const [cardsOpen, setCardsOpen] = useState(false)
  const hasTasks = useMemo(() => planTasks(p).length > 0, [p])
  return (
    <div className="col-span-12 grid grid-cols-2 gap-3">
      <Card>
        <CardContent>
          <MarkdownField
            label="Підсумки — що вдалося, а що ні"
            value={s}
            onChange={setS}
            placeholder="Що спрацювало? Що заважало? Що робити інакше?"
            maxLength={NOTES_L.summary}
            minHeight="160px"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <MarkdownField
            label="План на наступний тиждень"
            value={p}
            onChange={setP}
            placeholder="Що хочете встигнути? Рядок із «- [ ]» стане пунктом із галочкою"
            maxLength={NOTES_L.plan}
            minHeight="160px"
          />
          {hasTasks && (
            <Button
              variant="subtle"
              className="mt-3"
              // A plan over the limit isn't saved, and cards are made from the saved text.
              disabled={p.length > NOTES_L.plan!}
              onClick={() => {
                // Main reads the saved plan: what was just typed goes there first.
                flushAllAutosaves()
                setCardsOpen(true)
              }}
            >
              <SquareKanban /> Створити картки
            </Button>
          )}
        </CardContent>
      </Card>
      <PlanCardsDialog
        open={cardsOpen}
        onOpenChange={setCardsOpen}
        weekStart={weekStart}
        plan={p}
      />
    </div>
  )
}

function Archive({ current, onPick }: { current: string; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  // Controlled highlight: cmdk would start on the first week, not on the one that is open.
  const [sel, setSel] = useState(current)
  const { data = [] } = useApi('review', 'list', undefined, { enabled: open })
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setSel(current)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="soft">
          <ArchiveRestore /> Архів
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command value={sel} onValueChange={setSel}>
          <CommandList>
            <CommandEmpty>Минулих тижнів поки немає</CommandEmpty>
            <CommandGroup heading="Тижні">
              {data.map((w) => (
                <CommandItem
                  key={w.weekStart}
                  value={w.weekStart}
                  onSelect={() => {
                    onPick(w.weekStart)
                    setOpen(false)
                  }}
                  aria-current={w.weekStart === current || undefined}
                >
                  <span className="flex-1">{weekLabel(w.weekStart)}</span>
                  {w.hasNotes && <NotebookPen className="text-muted-foreground" />}
                  <Check aria-hidden className={cn(w.weekStart !== current && 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ReviewPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const week = params.get('week') ?? currentWeekKey()
  const isCurrent = week === currentWeekKey()
  const review = useInPlaceApi('review', 'get', isCurrent ? {} : { weekStart: week }, KEEP_PERIOD)
  const { data, isLoading } = review
  const setWeek = (key: string): void =>
    setParams(key === currentWeekKey() ? {} : { week: key }, { replace: true })
  const shift = (days: number): void => setWeek(dayKey(addDays(parseKey(week), days)))
  // Same keys as the calendar's «‹ period ›» group; there is no week after the current one.
  useHotkey('arrowleft', () => shift(-7))
  useHotkey('arrowright', () => {
    if (!isCurrent) shift(7)
  })
  useHotkey('t', () => setWeek(currentWeekKey()))
  // Sections switched off in «Налаштування → Меню» drop out of the view; the frozen snapshot stays as it is.
  const { prefs } = useNavVisibility()
  const rawSnapshot = data?.snapshot
  const snapshot = useMemo(
    () => (rawSnapshot ? visibleSnapshot(rawSnapshot, prefs) : undefined),
    [rawSnapshot, prefs]
  )
  const title = useMemo(() => (snapshot ? headline(snapshot) : ''), [snapshot])
  const filled = snapshot?.sections.filter((s) => !isEmpty(s)) ?? []
  const unchanged = snapshot?.sections.filter(isEmpty) ?? []
  const wide = wideSections(filled)
  const quiet = !!snapshot && filled.length === 0
  const previousWeek = dayKey(addDays(parseKey(currentWeekKey()), -7))
  if (review.failed)
    return <LoadError title="Не вдалося завантажити підсумки" onRetry={review.retry} />
  // The route's own skeleton, delayed: a fast load doesn't flash. Switching weeks keeps the old one (KEEP_PERIOD).
  if (isLoading || !data || !snapshot) return <PageSkeleton kind="overview" />

  return (
    <Page>
      <PageHeader
        title="Підсумки тижня"
        subtitle={
          isCurrent
            ? 'Поточний тиждень'
            : week === previousWeek
              ? 'Минулий тиждень'
              : 'Тиждень з архіву'
        }
        actions={
          <>
            <ButtonGroup>
              <Button
                variant="soft"
                size="icon"
                aria-label="Попередній тиждень (←)"
                onClick={() => shift(-7)}
              >
                <ChevronLeft />
              </Button>
              {/* Children stay direct Buttons: ButtonGroup joins only its direct children. The current week is a
                  plain label (the subtitle already says «Поточний тиждень»); a past week jumps back on click. */}
              {isCurrent ? (
                <Button variant="soft" asChild className="pointer-events-none min-w-36">
                  <span>{weekLabel(week)}</span>
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="soft"
                      className="min-w-36"
                      onClick={() => setWeek(currentWeekKey())}
                    >
                      {weekLabel(week)}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>До поточного тижня · T</TooltipContent>
                </Tooltip>
              )}
              <Button
                variant="soft"
                size="icon"
                aria-label="Наступний тиждень (→)"
                disabled={isCurrent}
                onClick={() => shift(7)}
              >
                <ChevronRight />
              </Button>
            </ButtonGroup>
            <Archive current={week} onPick={setWeek} />
          </>
        }
      />
      <PageBody>
        <div className="stagger grid grid-cols-12 gap-3">
          <div className="col-span-12 pb-2">
            <h2 className="font-display max-w-[28ch] text-title leading-[1.08] text-balance">
              {title}
            </h2>
            {quiet && (
              <p className="mt-2 text-caption text-muted-foreground">
                Цифри збираються із закритих карток, відгуків, нотаток і повторень за тиждень.
              </p>
            )}
          </div>

          {filled.length > 0 && (
            <div className="col-span-12 grid grid-flow-dense grid-cols-2 gap-3">
              {filled.map((s) => (
                <SectionCard key={s.id} section={s} wide={wide.has(s.id)} />
              ))}
            </div>
          )}
          {/* A wall of identical «nothing here» cards says nothing; one line names the quiet sections. */}
          {!quiet && unchanged.length > 0 && (
            <p className="col-span-12 text-body text-muted-foreground">
              Без змін {isCurrent ? 'цього тижня' : 'за тиждень'}:{' '}
              {unchanged.map((s) => s.title).join(', ')}.
            </p>
          )}

          {hasMoney(snapshot.money) && <MoneyCard money={snapshot.money} />}

          <ListCard title="Висить" className="col-span-5">
            {snapshot.pending.length === 0 ? (
              <CardEmptyText>
                Нічого не висить — на відгуки відповіли, завдання вчасно.
              </CardEmptyText>
            ) : (
              <div className="flex flex-col gap-4">
                {snapshot.pending.map((g) => (
                  <section key={g.title} className="flex flex-col gap-1">
                    <h3 className="flex items-center gap-2 text-caption font-semibold text-muted-foreground">
                      {g.title}
                      <Badge variant="soft">{g.items.length}</Badge>
                    </h3>
                    <div className="-mx-2.5 flex flex-col">
                      {g.items.map((i) => {
                        // main gives a route to rows that open a page instead of a record (subscriptions).
                        const route = i.route
                        return (
                          <EntityRow
                            key={`${i.type}:${i.id}`}
                            item={i}
                            onOpen={route ? () => navigate(route) : undefined}
                          />
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </ListCard>

          <ListCard title="Зроблено" className="col-span-3">
            {snapshot.done.length ? (
              <div className="-mx-2.5 flex flex-col">
                {snapshot.done.map((i) => (
                  <EntityRow key={`${i.type}:${i.id}`} item={i} />
                ))}
              </div>
            ) : (
              <CardEmptyText>Закриті завдання тижня з’являться тут.</CardEmptyText>
            )}
          </ListCard>

          <ListCard title="Наступного тижня" className="col-span-4">
            {snapshot.upcoming.length ? (
              <ItemGroup className="-mx-2.5 gap-1">
                {snapshot.upcoming.map((u, idx) => (
                  <Item
                    key={`${u.route}:${idx}`}
                    asChild
                    size="xs"
                    className="cursor-pointer hover:bg-(--tile-hover)"
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => navigate(u.route)}
                    >
                      {/* On a surface card the date block takes bg-card (DS §10); an all-day event has no time. */}
                      <EventDate when={u.at} withTime={!u.allDay} className="bg-card" />
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate font-normal">{u.title}</ItemTitle>
                      </ItemContent>
                    </button>
                  </Item>
                ))}
              </ItemGroup>
            ) : (
              <CardEmptyText>У календарі на наступний тиждень порожньо.</CardEmptyText>
            )}
          </ListCard>

          <Notes
            key={data.weekStart}
            weekStart={data.weekStart}
            summary={data.summary}
            plan={data.plan}
          />
        </div>
      </PageBody>
    </Page>
  )
}
