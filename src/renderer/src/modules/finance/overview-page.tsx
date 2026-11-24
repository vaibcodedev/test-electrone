import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { CircleAlert, Landmark, Receipt } from 'lucide-react'
import type { Currency } from '@shared/domain/crm'
import type { MoneyByCurrency } from '@shared/domain/finance'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDay, fmtMoney } from '@/lib/format'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { CATEGORY_LABEL, FinanceNav, MonthSwitcher, StatTile, moneyEntries } from './parts'
import { monthLabel, monthName, monthShort, useMonth } from './month'

const chartConfig = {
  net: { label: 'На руки', color: 'var(--chart-1)' },
  expenses: { label: 'Расходы', color: 'var(--chart-2)' }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>12 месяцев</CardTitle>
        <CardDescription>На руки после комиссий и все расходы, включая коннекты</CardDescription>
        {currencies.length > 1 && (
          <CardAction>
            <Segmented
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
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => fmtMoney(v, currency).replace(/,00(?=\D*$)/, '')}
              />
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
            title="Пока нечего показать"
            hint="Отметьте оплату по контракту или добавьте расход — здесь появится динамика по месяцам."
          />
        )}
      </CardContent>
    </Card>
  )
}

/** Subscriptions due this month that aren't marked paid yet. */
function UnpaidSubscriptions({ month }: { month: string }) {
  const { data: rows = [] } = useApi('finance', 'subscriptionMonth', { month })
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid', {
    successMessage: 'Отмечено оплаченным'
  })
  const navigate = useNavigate()
  const [nowTs] = useState(() => Date.now())
  const unpaid = rows.filter((r) => !r.expenseId)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Не оплачено в {monthName(month)}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => navigate(`/finance/expenses?month=${month}`)}
          >
            Все подписки
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {unpaid.length === 0 ? (
          <p className="text-body text-muted-foreground">
            {rows.length
              ? 'Все подписки этого месяца оплачены.'
              : 'Подписок нет. Добавьте Claude, телефон, хостинг — они будут появляться каждый месяц.'}
          </p>
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
                    {s.dueAt < nowTs ? 'списание было ' : 'спишется '}
                    {fmtDay(s.dueAt)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="xs"
                    variant="lime"
                    onClick={() => setPaid.mutate({ id: s.id, month, paid: true })}
                  >
                    Оплачено
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
    <Card>
      <CardHeader>
        <CardTitle>Деньги на платформах</CardTitle>
        <CardDescription>Заработано после комиссии минус выведено</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => navigate('/finance/withdrawals')}
          >
            Выводы
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-body text-muted-foreground">
            Всё выведено — на платформах ничего не осталось.
          </p>
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

function ExpensesByCategory({ month }: { month: string }) {
  const { data } = useApi('finance', 'month', { month })
  const rows = data?.expensesByCategory ?? []
  const maxByCurrency = new Map<Currency, number>()
  for (const r of rows)
    maxByCurrency.set(r.currency, Math.max(maxByCurrency.get(r.currency) ?? 0, r.amount))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Расходы по категориям</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-muted-foreground">В этом месяце расходов нет.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={`${r.category}:${r.currency}`} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-body">
                  <span>{CATEGORY_LABEL[r.category]}</span>
                  <span className="font-medium tabular-nums">{fmtMoney(r.amount, r.currency)}</span>
                </div>
                <Progress
                  value={(r.amount / (maxByCurrency.get(r.currency) || 1)) * 100}
                  className="h-1.5 bg-surface [&>[data-slot=progress-indicator]]:bg-chart-2"
                />
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
  const { data: report } = useApi('finance', 'month', { month })
  const subsLeft = report ? report.subscriptionsDue - report.subscriptionsPaid : 0
  const expensesTotal: MoneyByCurrency = { ...(report?.expenses ?? {}) }
  for (const [c, v] of moneyEntries(report?.creditPurchases))
    expensesTotal[c] = (expensesTotal[c] ?? 0) + v

  return (
    <Page>
      <PageHeader
        title="Финансы"
        subtitle="Доходы считаются из оплат по контрактам за вычетом комиссии платформы. Валюты не смешиваются."
        actions={<MonthSwitcher month={month} onChange={setMonth} />}
      >
        <FinanceNav />
      </PageHeader>
      <PageBody>
        {!report ? (
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-5 gap-3">
              <StatTile title="Получено" value={report.gross} hint="оплаты по контрактам" />
              <StatTile title="Комиссии платформ" value={report.fees} />
              <StatTile title="На руки" value={report.net} hint="после комиссий" />
              <StatTile
                title="Расходы"
                value={expensesTotal}
                hint={
                  moneyEntries(report.creditPurchases).length
                    ? `включая коннекты: ${moneyEntries(report.creditPurchases)
                        .map(([c, v]) => fmtMoney(v, c))
                        .join(', ')}`
                    : 'подписки и разовые'
                }
              />
              <StatTile
                ink
                title="Прибыль"
                value={report.profit}
                hint={
                  subsLeft > 0 ? (
                    <Badge variant="warn" className="mt-1">
                      <CircleAlert /> {subsLeft} подписк{subsLeft === 1 ? 'а' : 'и'} не отмечен
                      {subsLeft === 1 ? 'а' : 'ы'}
                    </Badge>
                  ) : (
                    'на руки − расходы − комиссии за вывод'
                  )
                }
              />
            </div>
            <YearChart />
            <div className="grid grid-cols-3 gap-3">
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
