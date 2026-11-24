import { useMemo, useState } from 'react'
import { MoneyLines } from '@/modules/finance/parts'
import { useNavigate, useSearchParams } from 'react-router'
import { addDays, format, startOfWeek } from 'date-fns'
import { ArchiveRestore, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Minus, NotebookPen } from 'lucide-react'
import type { Currency } from '@shared/domain/crm'
import type { WeekMetric, WeekSection, WeekSnapshot } from '@shared/domain/review'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtDay, fmtMinutes, fmtMoney, plural } from '@/lib/format'
import { useAutosave } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { EntityRow } from '@/components/common/entity-link'
import { MarkdownField } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const toKey = (d: Date): string => format(d, 'yyyy-MM-dd')
const currentWeekKey = (): string => toKey(startOfWeek(new Date(), { weekStartsOn: 1 }))
const parseKey = (key: string): Date => new Date(`${key}T00:00:00`)

function weekLabel(key: string): string {
  const from = parseKey(key)
  const to = addDays(from, 6)
  const sameMonth = from.getMonth() === to.getMonth()
  return sameMonth
    ? `${format(from, 'd', { locale: LOCALE })}–${format(to, 'd MMMM', { locale: LOCALE })}`
    : `${format(from, 'd MMM', { locale: LOCALE })} – ${format(to, 'd MMM', { locale: LOCALE })}`
}

function fmtValue(m: Pick<WeekMetric, 'unit'>, v: number): string {
  if (m.unit === 'minutes') return fmtMinutes(v)
  if (m.unit === 'percent') return `${v}%`
  return String(v)
}

/** «12 задач, 1 040 $ на руки, 3 собеседования» — a one-line story of the week. */
function headline(s: WeekSnapshot): string {
  const metric = (key: string): number => s.sections.flatMap((x) => x.metrics).find((m) => m.key === key)?.value ?? 0
  const parts: string[] = []
  const cards = metric('cardsDone')
  if (cards) parts.push(`${cards} ${plural(cards, ['завдання', 'завдання', 'завдань'])}`)
  const net = Object.entries(s.money.net).find(([, v]) => (v ?? 0) > 0)
  if (net) parts.push(`${fmtMoney(net[1] ?? 0, net[0] as Currency)} на руки`)
  const interviews = metric('interviews')
  if (interviews) parts.push(`${interviews} ${plural(interviews, ['співбесіда', 'співбесіди', 'співбесід'])}`)
  const sent = metric('proposals') + metric('applications')
  if (sent) parts.push(`${sent} ${plural(sent, ['відгук', 'відгуки', 'відгуків'])}`)
  const minutes = metric('minutes')
  if (!cards && minutes) parts.push(`${fmtMinutes(minutes)} роботи`)
  // Non-breaking spaces keep "1 собеседование" on one line; lines break only between facts.
  return parts.length ? parts.slice(0, 3).map((p) => p.replace(/ /g, ' ')).join(', ') : 'Тихий тиждень'
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
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={good ? 'success' : 'soft'} className={cn(!good && 'text-muted-foreground')}>
          <Icon />
          {fmtValue(m, Math.abs(diff))}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Минулий тиждень: {fmtValue(m, m.previous)}</TooltipContent>
    </Tooltip>
  )
}

function SectionCard({ section }: { section: WeekSection }) {
  const empty = section.metrics.every((m) => !m.value && !m.previous)
  return (
    <Card className={cn(section.metrics.length > 3 ? 'col-span-6' : 'col-span-4', empty && 'opacity-70')}>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {section.metrics.map((m) => (
          <div key={m.key} className="flex flex-col gap-1.5 rounded-2xl bg-card p-3">
            <span className="text-caption text-muted-foreground">{m.label}</span>
            <span className="font-display text-headline leading-none tabular-nums">{fmtValue(m, m.value)}</span>
            <Delta m={m} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function MoneyCard({ money }: { money: WeekSnapshot['money'] }) {
  return (
    <div className="col-span-12 grid grid-cols-3 gap-3">
      <Card>
        <CardHeader>
          <CardTitle>На руки</CardTitle>
        </CardHeader>
        <CardContent className="font-display text-headline leading-none"><MoneyLines value={money.net} compact /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Витрати</CardTitle>
        </CardHeader>
        <CardContent className="font-display text-headline leading-none"><MoneyLines value={money.expenses} compact /></CardContent>
      </Card>
      <Card className="bg-ink text-ink-foreground">
        <CardHeader>
          <CardTitle className="text-ink-muted">Прибуток за тиждень</CardTitle>
        </CardHeader>
        <CardContent className="font-display text-headline leading-none"><MoneyLines value={money.profit} compact /></CardContent>
      </Card>
    </div>
  )
}

function Notes({ weekStart, summary, plan }: { weekStart: string; summary: string; plan: string }) {
  const save = useApiMutation('review', 'saveNotes', { silent: false })
  const [s, setS] = useAutosave(summary, (next) => save.mutate({ weekStart, summary: next }))
  const [p, setP] = useAutosave(plan, (next) => save.mutate({ weekStart, plan: next }))
  return (
    <div className="col-span-12 grid grid-cols-2 gap-3">
      <Card>
        <CardContent>
          <MarkdownField
            label="Підсумки — що вдалося, а що ні"
            value={s}
            onChange={setS}
            placeholder="Що спрацювало? Що заважало? Що робити інакше?"
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
            placeholder="- [ ] 10 відгуків на Djinni&#10;- [ ] Доробити редизайн Bloom"
            minHeight="160px"
          />
        </CardContent>
      </Card>
    </div>
  )
}

function Archive({ current, onPick }: { current: string; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const { data = [] } = useApi('review', 'list', undefined, { enabled: open })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="soft">
          <ArchiveRestore /> Архів
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 rounded-2xl p-0" align="end">
        <Command>
          <CommandList>
            <CommandEmpty>Минулих оглядів поки немає</CommandEmpty>
            <CommandGroup heading="Тижні">
              {data.map((w) => (
                <CommandItem
                  key={w.weekStart}
                  value={w.weekStart}
                  onSelect={() => {
                    onPick(w.weekStart)
                    setOpen(false)
                  }}
                  className={cn(w.weekStart === current && 'font-medium')}
                >
                  <span className="flex-1">{weekLabel(w.weekStart)}</span>
                  {w.hasNotes && <NotebookPen className="text-muted-foreground" />}
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
  const { data, isLoading } = useApi('review', 'get', isCurrent ? {} : { weekStart: week }, KEEP_PERIOD)
  const setWeek = (key: string): void => setParams(key === currentWeekKey() ? {} : { week: key }, { replace: true })
  const shift = (days: number): void => setWeek(toKey(addDays(parseKey(week), days)))
  const snapshot = data?.snapshot
  const title = useMemo(() => (snapshot ? headline(snapshot) : ''), [snapshot])

  return (
    <Page>
      <PageHeader
        title="Підсумки тижня"
        subtitle={`${isCurrent ? 'Поточний тиждень' : 'Тиждень'}: ${weekLabel(week)}`}
        actions={
          <>
            <ButtonGroup>
              <Button variant="soft" size="icon" aria-label="Попередній тиждень" onClick={() => shift(-7)}>
                <ChevronLeft />
              </Button>
              <Button variant="soft" className="min-w-36" onClick={() => setWeek(currentWeekKey())}>
                {weekLabel(week)}
              </Button>
              <Button variant="soft" size="icon" aria-label="Наступний тиждень" disabled={isCurrent} onClick={() => shift(7)}>
                <ChevronRight />
              </Button>
            </ButtonGroup>
            <Archive current={week} onPick={setWeek} />
          </>
        }
      />
      <PageBody>
        {isLoading || !data || !snapshot ? (
          <div className="grid grid-cols-12 gap-3">
            <Skeleton className="col-span-12 h-28 rounded-3xl" />
            <Skeleton className="col-span-6 h-48 rounded-3xl" />
            <Skeleton className="col-span-6 h-48 rounded-3xl" />
          </div>
        ) : (
          <div className="stagger grid grid-cols-12 gap-3">
            <div className="col-span-12 pb-2">
              <h2 className="font-display max-w-[28ch] text-title leading-[1.08] text-balance">{title}</h2>
            </div>

            {snapshot.sections.map((s) => (
              <SectionCard key={s.id} section={s} />
            ))}

            <MoneyCard money={snapshot.money} />

            <Card className="col-span-5">
              <CardHeader>
                <CardTitle>Висить</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {snapshot.pending.length === 0 && (
                  <p className="text-body text-muted-foreground">Нічого не висить — на відгуки відповіли, завдання вчасно.</p>
                )}
                {snapshot.pending.map((g) => {
                  const isSubscription = /п[оі]дпис/i.test(g.title)
                  return (
                    <section key={g.title} className="flex flex-col gap-1">
                      <h3 className="flex items-center gap-2 text-caption font-semibold text-muted-foreground">
                        {g.title}
                        <Badge variant="soft">{g.items.length}</Badge>
                      </h3>
                      <div className="-mx-2.5 flex flex-col">
                        {g.items.map((i) => (
                          <EntityRow
                            key={`${i.type}:${i.id}`}
                            item={i}
                            onOpen={isSubscription ? () => navigate('/finance/expenses') : undefined}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Зроблено</CardTitle>
              </CardHeader>
              <CardContent>
                {snapshot.done.length ? (
                  <div className="-mx-2.5 flex flex-col">
                    {snapshot.done.map((i) => (
                      <EntityRow key={`${i.type}:${i.id}`} item={i} />
                    ))}
                  </div>
                ) : (
                  <p className="text-body text-muted-foreground">Закриті завдання тижня з’являться тут.</p>
                )}
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Наступного тижня</CardTitle>
              </CardHeader>
              <CardContent>
                {snapshot.upcoming.length ? (
                  <ItemGroup className="gap-1">
                    {snapshot.upcoming.map((u, idx) => (
                      <Item key={`${u.route}:${idx}`} asChild size="xs" className="cursor-pointer hover:bg-card">
                        <button type="button" className="w-full text-left" onClick={() => navigate(u.route)}>
                          <ItemContent className="min-w-0">
                            <ItemTitle className="w-full truncate font-normal">{u.title}</ItemTitle>
                            <ItemDescription className="text-meta">
                              {fmtDay(u.at)}, {format(u.at, 'HH:mm')}
                            </ItemDescription>
                          </ItemContent>
                        </button>
                      </Item>
                    ))}
                  </ItemGroup>
                ) : (
                  <p className="text-body text-muted-foreground">У календарі на наступний тиждень порожньо.</p>
                )}
              </CardContent>
            </Card>

            <Notes key={data.weekStart} weekStart={data.weekStart} summary={data.summary} plan={data.plan} />
          </div>
        )}
      </PageBody>
    </Page>
  )
}
