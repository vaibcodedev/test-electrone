import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ChartColumn } from 'lucide-react'
import { format, parseISO, startOfDay, subDays } from 'date-fns'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { JobFunnelRow } from '@shared/domain/jobs'
import { useApi } from '@/lib/query'
import { fmtReplyTime, LOCALE } from '@/lib/format'
import { EmptyState, Page, PageBody, PageHeader, Segmented } from '@/components/common/page'
import { CardSkeleton, Delayed } from '@/components/common/page-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Funnel, FunnelTable, WithRate, type FunnelColumn } from '@/components/common/funnel'
import { STAGE_KIND_LABEL } from './labels'

const RANGES = [
  { value: '30', label: '30 днів' },
  { value: '90', label: '90 днів' },
  { value: '365', label: 'Рік' }
] as const
type Range = (typeof RANGES)[number]['value']

/** Two series → the chart-1 / chart-2 pair, as in freelance stats (validated by dataviz in both themes). */
const weeklyConfig = {
  applied: { label: 'Відгуки', color: 'var(--chart-1)' },
  replied: { label: 'Відповіли', color: 'var(--chart-2)' }
} satisfies ChartConfig

const COLUMNS: FunnelColumn<JobFunnelRow>[] = [
  { header: 'Відгуки', cell: (r) => r.applied },
  { header: 'Відповіді', cell: (r) => <WithRate value={r.replied} rate={r.replyRate} /> },
  { header: 'Співбесіди', cell: (r) => r.interview },
  { header: 'Офери', cell: (r) => <WithRate value={r.offer} rate={r.offerRate} /> }
]

/** Job search analytics: funnel, weekly activity, which board / resume / letter works. */
export function JobStatsPage(): ReactElement {
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>('90')
  // No `to`: the server counts up to "now" on every refetch, so new records show up without reopening.
  // `from` is a local midnight — the query key stays stable within a day.
  const from = startOfDay(subDays(new Date(), Number(range))).getTime()
  const { data } = useApi('jobs', 'stats', { from })
  const weekly = (data?.weekly ?? []).map((w) => ({ ...w, label: format(parseISO(w.week), 'd MMM', { locale: LOCALE }) }))

  return (
    <Page>
      <PageHeader
        title="Статистика пошуку"
        subtitle="Які майданчики, версії резюме й листи дають відповіді."
        actions={<Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />}
      />
      <PageBody>
        {!data ? (
          <Delayed delay={150}>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <CardSkeleton key={i} height={280} />
              ))}
            </div>
          </Delayed>
        ) : data.totals.applied === 0 ? (
          <EmptyState
            icon={ChartColumn}
            title="За період відгуків немає"
            hint="Додавайте вакансії зі статусом «Надіслано» — тут з’явиться воронка."
            cta={{ label: 'До вакансій', onClick: () => navigate('/jobs/applications') }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Воронка</CardTitle>
                <CardDescription>
                  {data.avgReplyDays !== null ? `У середньому відповідають ${fmtReplyTime(data.avgReplyDays * 24)}` : 'Відповідей поки не було'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Funnel
                  steps={[
                    { label: 'Відгуки', value: data.totals.applied },
                    { label: 'Відповіли', value: data.totals.replied },
                    { label: 'Співбесіди', value: data.totals.interview },
                    { label: 'Офери', value: data.totals.offer }
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>За тижнями</CardTitle>
                <CardDescription>Скільки відгуків надіслано і на скільки відповіли</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={weeklyConfig} className="aspect-auto h-52 w-full">
                  <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barGap={2}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="applied" fill="var(--color-applied)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="replied" fill="var(--color-replied)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <FunnelTable title="За майданчиками" description="Де відгукуватися вигідніше" rows={data.byBoard} columns={COLUMNS} />
            <FunnelTable title="За версіями резюме" description="Яка версія частіше отримує відповідь" rows={data.byResume} columns={COLUMNS} />
            <FunnelTable title="За шаблонами листів" description="Супровідні листи, які працюють" rows={data.byTemplate} columns={COLUMNS} />
            <Card>
              <CardHeader>
                <CardTitle>Етапи</CardTitle>
                <CardDescription>Скільки етапів пройдено успішно</CardDescription>
              </CardHeader>
              <CardContent>
                {data.stagesByKind.length === 0 ? (
                  <p className="text-body text-muted-foreground">Етапів за період не було.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.stagesByKind.map((s) => (
                      <div key={s.kind} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
                        <span className="text-body">{STAGE_KIND_LABEL[s.kind]}</span>
                        <Progress
                          value={s.total ? (s.passed / s.total) * 100 : 0}
                          aria-label={STAGE_KIND_LABEL[s.kind]}
                          className="h-2.5 bg-card *:data-[slot=progress-indicator]:rounded-full *:data-[slot=progress-indicator]:bg-chart-1"
                        />
                        <span className="text-right text-caption text-muted-foreground tabular-nums">
                          пройдено {s.passed} з {s.total}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </Page>
  )
}
