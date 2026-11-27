import { cn } from '@/lib/utils'
import { useState } from 'react'
import { format, parseISO, startOfDay, subDays } from 'date-fns'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { FunnelRow, Platform } from '@shared/domain/freelance'
import { useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { LOCALE, fmtReplyTime, fmtPercent } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { EmptyState, Segmented } from '@/components/common/page'
import { Funnel, FunnelTable, WithRate, type FunnelColumn } from '@/components/common/funnel'
import { CardSkeleton, Delayed } from '@/components/common/page-skeleton'

const RANGES = [
  { value: '30', label: '30 днів' },
  { value: '90', label: '90 днів' },
  { value: '365', label: 'Рік' }
] as const
type Range = (typeof RANGES)[number]['value']

/** Chart tokens only (design-system → Графики): chart-1/chart-2 are the validated pair in both themes. */
const weeklyConfig = {
  sent: { label: 'Надіслано', color: 'var(--chart-1)' },
  replied: { label: 'Відповіли', color: 'var(--chart-2)' }
} satisfies ChartConfig

/** Group table columns; the credits column only for platforms that have credits (Connects). */
function columns(creditsName: string): FunnelColumn<FunnelRow>[] {
  return [
    { header: 'Відгуків', cell: (r) => r.sent },
    { header: 'Відповіді', cell: (r) => <WithRate value={r.replied} rate={r.replyRate} /> },
    { header: 'Контракти', cell: (r) => <WithRate value={r.hired} rate={r.hireRate} /> },
    ...(creditsName ? [{ header: creditsName, cell: (r: FunnelRow) => r.credits }] : [])
  ]
}

/** Funnel, conversion by task type and template, weekly activity for one platform. */
export function StatsTab({ platform }: { platform: Platform }) {
  const [range, setRange] = useState<Range>('90')
  // No `to`: the server counts up to "now" on every refetch, so new proposals show up without reopening.
  // `from` is a local midnight — the query key stays stable within a day.
  const from = startOfDay(subDays(new Date(), Number(range))).getTime()
  const query = useInPlaceApi('freelance', 'stats', { platformId: platform.id, from })
  const { data: stats } = query

  if (query.failed)
    return <LoadError title="Не вдалося завантажити статистику" onRetry={query.retry} />
  if (!stats)
    return (
      <Delayed delay={150}>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64 rounded-full" />
          <div className="grid grid-cols-12 gap-3">
            <CardSkeleton height={280} className="col-span-5" />
            <CardSkeleton height={280} className="col-span-7" />
          </div>
        </div>
      </Delayed>
    )
  const t = stats.totals
  const cols = columns(platform.creditsName)
  const weekly = stats.weekly.map((w) => ({
    ...w,
    label: format(parseISO(w.week), 'd MMM', { locale: LOCALE }).replace('.', '')
  }))

  // min-h-full without data: the empty state is centred under the period switch.
  return (
    <div className={cn('flex flex-col gap-4', t.sent === 0 && 'min-h-full')}>
      <div className="flex items-center justify-between">
        <Segmented
          className="w-fit"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <span className="text-caption text-muted-foreground">
          {stats.avgReplyHours !== null
            ? `Клієнти відповідають у середньому ${fmtReplyTime(stats.avgReplyHours)}`
            : 'Відповідей поки немає'}
        </span>
      </div>

      {t.sent === 0 ? (
        <EmptyState
          illustration="chart"
          title="За цей період відгуків немає"
          hint="Статистика з’явиться, коли ви надішлете кілька відгуків."
        />
      ) : (
        <>
          <div className="stagger grid grid-cols-12 gap-3">
            <Card className="col-span-5">
              <CardHeader>
                <CardTitle>Воронка</CardTitle>
                <CardDescription>
                  Відповіли на {fmtPercent(t.replyRate)} відгуків, контракт у {fmtPercent(t.hireRate)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Funnel
                  steps={[
                    { label: 'Надіслано', value: t.sent },
                    { label: 'Відповіли', value: t.replied },
                    { label: 'Інтерв’ю', value: t.interview },
                    { label: 'Контракт', value: t.hired }
                  ]}
                />
              </CardContent>
            </Card>
            <Card className="col-span-7">
              <CardHeader>
                <CardTitle>За тижнями</CardTitle>
                <CardDescription>Скільки відгуків надіслано й на скільки відповіли</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={weeklyConfig} className="aspect-auto h-52 w-full">
                  <BarChart
                    data={weekly}
                    margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                    barGap={2}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={16}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="sent" fill="var(--color-sent)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="replied" fill="var(--color-replied)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FunnelTable
              title="За типами завдань"
              description="Де вас частіше обирають"
              groupHeader="Тип завдання"
              rows={stats.byNiche}
              columns={cols}
            />
            <FunnelTable
              title="За шаблонами"
              description="Які тексти відгуків працюють краще"
              groupHeader="Шаблон"
              rows={stats.byTemplate}
              columns={cols}
            />
          </div>
        </>
      )}
    </div>
  )
}
