import { useState } from 'react'
import { format, parseISO, startOfDay, subDays } from 'date-fns'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { FunnelRow, Platform } from '@shared/domain/freelance'
import { useApi } from '@/lib/query'
import { LOCALE, fmtReplyTime, fmtPercent } from '@/lib/format'
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

const RANGES = [
  { value: '30', label: '30 днів' },
  { value: '90', label: '90 днів' },
  { value: '365', label: 'Рік' }
] as const
type Range = (typeof RANGES)[number]['value']

/** Two series → validated pair (dataviz validator: light #6b8c00/#5b6be0 on surface; dark pair passes contrast & CVD). */
const weeklyConfig = {
  sent: { label: 'Надіслано', theme: { light: '#6b8c00', dark: '#d8f74a' } },
  replied: { label: 'Відповіли', theme: { light: '#5b6be0', dark: '#8b98ff' } }
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
  const { data: stats } = useApi('freelance', 'stats', { platformId: platform.id, from })

  if (!stats) return null
  const t = stats.totals
  const cols = columns(platform.creditsName)
  const weekly = stats.weekly.map((w) => ({
    ...w,
    label: format(parseISO(w.week), 'd MMM', { locale: LOCALE })
  }))

  return (
    <div className="flex flex-col gap-4">
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
                <CardTitle>По тижнях</CardTitle>
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
              groupHeader="Група"
              rows={stats.byNiche}
              columns={cols}
            />
            <FunnelTable
              title="За шаблонами"
              description="Які тексти відгуків працюють краще"
              groupHeader="Група"
              rows={stats.byTemplate}
              columns={cols}
            />
          </div>
        </>
      )}
    </div>
  )
}
