import { useMemo, useState, type ReactElement } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { Currency } from '@shared/domain/crm'
import type { MoneyByCurrency } from '@shared/domain/finance'
import { useApi } from '@/lib/query'
import { fmtMoney } from '@/lib/format'
import { CURRENCY_SIGN } from '../crm/labels'
import { EmptyState, Segmented } from '@/components/common/page'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { moneyEntries } from './money'
import { monthLabel, monthShort } from './month'

const COMPACT = new Intl.NumberFormat('uk-UA', { notation: 'compact', maximumFractionDigits: 1 })

const chartConfig = {
  net: { label: 'На руки', color: 'var(--chart-1)' },
  expenses: { label: 'Витрати', color: 'var(--chart-2)' }
} satisfies ChartConfig

function sumOf(m: MoneyByCurrency | undefined, c: Currency): number {
  return m?.[c] ?? 0
}

/**
 * Two series (net vs expenses) over 12 months → legend + tooltip; palette validated with the dataviz
 * validator. The month picked in MonthSwitcher is the bold, foreground tick.
 */
export function YearChart({ month }: { month: string }): ReactElement {
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
    key: m.month,
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
        <CardTitle>Доходи й витрати за рік</CardTitle>
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
              <XAxis
                dataKey="key"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={({ x, y, payload }) => {
                  const selected = payload.value === month
                  return (
                    <text
                      x={x}
                      y={y}
                      dy="0.71em"
                      textAnchor="middle"
                      fill={selected ? 'var(--foreground)' : 'var(--muted-foreground)'}
                      fontWeight={selected ? 600 : 400}
                    >
                      {monthShort(String(payload.value))}
                    </text>
                  )
                }}
              />
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
              {/* Recharts sorts legend items by name by default; keep the bars' order. */}
              <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
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
