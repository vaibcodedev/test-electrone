import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Check, CircleAlert, Landmark, Plus, Receipt } from 'lucide-react'
import type { Currency } from '@shared/domain/crm'
import type { MoneyByCurrency } from '@shared/domain/finance'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { fmtDay, fmtMoney, plural } from '@/lib/format'
import { CURRENCY_SIGN } from '../crm/labels'
import { EmptyState, Page, PageBody, PageHeader, Segmented } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { CATEGORY_LABEL, FinanceNav, MonthSwitcher, MoneyStatTile, moneyEntries } from './parts'
import { monthLabel, monthName, monthShort, useMonth } from './month'

const COMPACT = new Intl.NumberFormat('uk-UA', { notation: 'compact', maximumFractionDigits: 1 })

const chartConfig = {
  net: { label: 'На руки', color: 'var(--chart-1)' },
  expenses: { label: 'Витрати', color: 'var(--chart-2)' }
} satisfies ChartConfig

function sumOf(m: MoneyByCurrency | undefined, c: Currency): number {
  return m?.[c] ?? 0
}

/** Two series (net vs expenses) → legend + tooltip; palette validated with the dataviz validator. */
function YearChart() {
  const { data } = useApi('finance', 'overview')
  const currencies = useMemo(() => {
    const totals = new Map<Currency, number>()
    for (const m of data?.months ?? []) {
      for (const [c, v] of moneyEntries(m.net)) totals.set(c, (totals.get(c) ?? 0) + Math.abs(v))
      for (const [c, v] of moneyEntries(m.expenses))
        totals.set(c, (totals.get(c) ?? 0) + Math.abs(v))
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [data])
  const [picked, setPicked] = useState<Currency | null>(null)
  const currency = picked && currencies.includes(picked) ? picked : (currencies[0] ?? 'USD')

  if (!data) return <Skeleton className="h-72 rounded-3xl" />
  const rows = data.months.map((m) => ({
    month: monthShort(m.month),
    full: monthLabel(m.month),
    net: sumOf(m.net, currency),
    expenses: sumOf(m.expenses, currency)
  }))
  const hasData = rows.some((r) => r.net || r.expenses)
  // Compact ticks («50 млн $», «3,5 тис. $») and an axis wide enough for the longest one; tooltips keep exact amounts.
  const sign = (CURRENCY_SIGN as Record<string, string>)[currency] ?? currency
  const tick = (v: number): string => `${COMPACT.format(v)} ${sign}`
  const top = Math.max(0, ...rows.map((r) => Math.max(r.net, r.expenses)))
  const axisWidth = Math.max(40, tick(top).length * 8 + 8)

  return (
    <Card>
      <CardHeader>
        <CardTitle>12 місяців</CardTitle>
        <CardDescription>На руки після комісій і всі витрати, включно з конектами</CardDescription>
        {currencies.length > 1 && (
          <CardAction>
            <Segmented
              className="w-fit"
              size="xs"
              value={currency}
              onChange={(c) => setPicked(c)}
              options={currencies.map((c) => ({ value: c, label: c }))}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <BarChart
              data={rows}
              margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              barGap={2}
              barCategoryGap="22%"
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={axisWidth} tickFormatter={tick} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {chartConfig[name as keyof typeof chartConfig]?.label}
                        </span>
                        <span className="font-medium tabular-nums">
                          {fmtMoney(Number(value), currency)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="net" fill="var(--color-net)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyState
            title="Поки нічого показати"
            hint="Позначте оплату за контрактом або додайте витрату — тут з’явиться динаміка по місяцях."
          />
        )}
      </CardContent>
    </Card>
  )
}

/** Compact state for an empty card: icon in a circle, one line, an optional action — centred in the card. */
function CardState({ text, action, done }: { text: string; action?: ReactNode; done?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-2 text-center">
      <span
        className={cn(
          'grid size-9 place-items-center rounded-full',
          done ? 'bg-success/15 text-success' : 'bg-foreground/7 text-muted-foreground'
        )}
      >
        {done ? <Check className="size-4" /> : <Plus className="size-4" />}
      </span>
      <p className="max-w-64 text-body text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}

/** Subscriptions due this month that aren't marked paid yet. */
function UnpaidSubscriptions({ month }: { month: string }) {
  const { data: rows = [] } = useApi('finance', 'subscriptionMonth', { month }, KEEP_PERIOD)
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid', {
    successMessage: 'Позначено оплаченим'
  })
  const navigate = useNavigate()
  const [nowTs] = useState(() => Date.now())
  const unpaid = rows.filter((r) => !r.expenseId)
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Не оплачено за {monthName(month)}</CardTitle>
        <CardAction>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => navigate(`/finance/expenses?month=${month}`)}
          >
            Усі підписки
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {unpaid.length === 0 ? (
          <CardState
            done={rows.length > 0}
            text={
              rows.length
                ? 'Усі підписки цього місяця оплачено'
                : 'Підписок немає — додайте Claude, телефон, хостинг'
            }
            action={
              <Button
                variant="subtle"
                size="xs"
                onClick={() => navigate(`/finance/expenses?month=${month}`)}
              >
                <Plus /> Додати підписку
              </Button>
            }
          />
        ) : (
          <ItemGroup className="gap-1.5">
            {unpaid.map((s) => (
              <Item key={s.id} size="xs" variant="muted">
                <ItemMedia variant="icon" className="bg-card">
                  <Receipt />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate">{s.title}</ItemTitle>
                  <ItemDescription className="text-caption">
                    {fmtMoney(s.amount, s.currency)} ·{' '}
                    {s.dueAt < nowTs ? 'списання було ' : 'спишеться '}
                    {fmtDay(s.dueAt)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => setPaid.mutate({ id: s.id, month, paid: true })}
                  >
                    <Check /> Оплачено
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

function PlatformBalances() {
  const { data } = useApi('finance', 'overview')
  const navigate = useNavigate()
  const list = (data?.platformBalances ?? []).filter((b) => Math.abs(b.balance) >= 0.01)
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Гроші на платформах</CardTitle>
        <CardDescription>Зароблено після комісії мінус виведено</CardDescription>
        <CardAction>
          <Button variant="subtle" size="xs" onClick={() => navigate('/finance/withdrawals')}>
            Виведення
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {list.length === 0 ? (
          <CardState
            done
            text="Усе виведено — на платформах нічого не лишилося"
            action={
              <Button variant="subtle" size="xs" onClick={() => navigate('/finance/withdrawals')}>
                <Plus /> Записати виведення
              </Button>
            }
          />
        ) : (
          <ItemGroup className="gap-1.5">
            {list.map((b) => (
              <Item key={b.platformId} size="xs" variant="muted">
                <ItemMedia variant="icon" className="bg-card">
                  <Landmark />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{b.name}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <span
                    className={
                      b.balance < 0 ? 'text-destructive tabular-nums' : 'font-medium tabular-nums'
                    }
                  >
                    {fmtMoney(b.balance, b.currency)}
                  </span>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

const CATEGORY_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']

/** Each category as a share of the month total (per currency), top 5 + «Інші», one palette colour each. */
function ExpensesByCategory({ month }: { month: string }) {
  const navigate = useNavigate()
  const { data } = useApi('finance', 'month', { month }, KEEP_PERIOD)
  const rows = data?.expensesByCategory ?? []
  const groups = useMemo(() => {
    const byCurrency = new Map<Currency, { label: string; amount: number }[]>()
    for (const r of rows) {
      const list = byCurrency.get(r.currency) ?? []
      list.push({ label: CATEGORY_LABEL[r.category], amount: r.amount })
      byCurrency.set(r.currency, list)
    }
    return [...byCurrency.entries()].map(([currency, list]) => {
      const sorted = [...list].sort((a, b) => b.amount - a.amount)
      const top = sorted.slice(0, 5)
      const rest = sorted.slice(5).reduce((sum, x) => sum + x.amount, 0)
      if (rest > 0) top.push({ label: 'Інші', amount: rest })
      const total = sorted.reduce((sum, x) => sum + x.amount, 0) || 1
      return { currency, total, items: top.map((x) => ({ ...x, share: (x.amount / total) * 100 })) }
    })
  }, [rows])
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Витрати за категоріями</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {groups.length === 0 ? (
          <CardState
            text="Цього місяця витрат немає"
            action={
              <Button
                variant="subtle"
                size="xs"
                onClick={() => navigate(`/finance/expenses?month=${month}`)}
              >
                <Plus /> Додати витрату
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.currency} className="flex flex-col gap-3">
                {g.items.map((r, idx) => (
                  <div key={r.label} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-2 text-body">
                      <span
                        className={cn(
                          'size-2 shrink-0 self-center rounded-full',
                          r.label === 'Інші' ? 'bg-muted-foreground' : CATEGORY_COLORS[idx % 5]
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span className="font-medium tabular-nums">
                        {fmtMoney(r.amount, g.currency)}
                      </span>
                      <span className="w-10 text-right text-caption text-muted-foreground tabular-nums">
                        {Math.round(r.share)}%
                      </span>
                    </div>
                    <Progress
                      value={r.share}
                      aria-label={`${r.label}: ${Math.round(r.share)}%`}
                      className={cn(
                        'h-1.5',
                        r.label === 'Інші'
                          ? '[&>[data-slot=progress-indicator]]:bg-muted-foreground'
                          : [
                              '[&>[data-slot=progress-indicator]]:bg-chart-1',
                              '[&>[data-slot=progress-indicator]]:bg-chart-2',
                              '[&>[data-slot=progress-indicator]]:bg-chart-3',
                              '[&>[data-slot=progress-indicator]]:bg-chart-4',
                              '[&>[data-slot=progress-indicator]]:bg-chart-5'
                            ][idx % 5]
                      )}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function FinanceOverviewPage() {
  const [month, setMonth] = useMonth()
  const { data: report } = useApi('finance', 'month', { month }, KEEP_PERIOD)
  const subsLeft = report ? report.subscriptionsDue - report.subscriptionsPaid : 0
  const expensesTotal: MoneyByCurrency = { ...(report?.expenses ?? {}) }
  for (const [c, v] of moneyEntries(report?.creditPurchases))
    expensesTotal[c] = (expensesTotal[c] ?? 0) + v

  return (
    <Page>
      <PageHeader
        title="Фінанси"
        subtitle="Доходи рахуються з оплат за контрактами за вирахуванням комісії платформи. Валюти не змішуються."
        actions={<MonthSwitcher month={month} onChange={setMonth} />}
      >
        <FinanceNav />
      </PageHeader>
      <PageBody>
        {!report ? (
          <div className="stagger grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="stagger grid grid-cols-5 gap-3">
              <MoneyStatTile label="Отримано" value={report.gross} hint="оплати за контрактами" />
              <MoneyStatTile label="Комісії платформ" value={report.fees} />
              <MoneyStatTile label="На руки" value={report.net} hint="після комісій" />
              <MoneyStatTile
                label="Витрати"
                value={expensesTotal}
                hint={
                  moneyEntries(report.creditPurchases).length
                    ? `включно з конектами: ${moneyEntries(report.creditPurchases)
                        .map(([c, v]) => fmtMoney(v, c))
                        .join(', ')}`
                    : 'підписки й разові'
                }
              />
              <MoneyStatTile
                tone="ink"
                label="Прибуток"
                value={report.profit}
                hint={
                  subsLeft > 0 ? (
                    <Badge variant="warn" className="mt-1">
                      <CircleAlert /> {subsLeft}{' '}
                      {plural(subsLeft, ['підписку', 'підписки', 'підписок'])} не позначено
                    </Badge>
                  ) : (
                    'на руки − витрати − комісії за виведення'
                  )
                }
              />
            </div>
            <YearChart />
            {/* Equal-height cards; empty ones centre their compact state. */}
            <div className="grid grid-cols-3 items-stretch gap-3">
              <UnpaidSubscriptions month={month} />
              <PlatformBalances />
              <ExpensesByCategory month={month} />
            </div>
          </div>
        )}
      </PageBody>
    </Page>
  )
}
