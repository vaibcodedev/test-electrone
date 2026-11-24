import { useState } from 'react'
import { format, parseISO, startOfDay, subDays } from 'date-fns'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { JobFunnelRow } from '@shared/domain/jobs'
import { useApi } from '@/lib/query'
import { LOCALE, fmtPercent } from '@/lib/format'
import { EmptyState, Page, PageBody, PageHeader, Segmented } from '@/components/common/page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { STAGE_KIND_LABEL } from './j2-labels'

const RANGES = [
  { value: '30', label: '30 днів' },
  { value: '90', label: '90 днів' },
  { value: '365', label: 'Рік' }
] as const
type Range = (typeof RANGES)[number]['value']

/** Two series → the validated pair already used in freelance stats (passes contrast & CVD in both themes). */
const weeklyConfig = {
  applied: { label: 'Відгуки', theme: { light: '#6b8c00', dark: '#d8f74a' } },
  replied: { label: 'Відповіли', theme: { light: '#5b6be0', dark: '#8b98ff' } }
} satisfies ChartConfig

function Funnel({ totals }: { totals: JobFunnelRow }) {
  const steps = [
    { label: 'Відгуки', value: totals.applied },
    { label: 'Відповіли', value: totals.replied },
    { label: 'Співбесіди', value: totals.interview },
    { label: 'Офери', value: totals.offer }
  ]
  const max = Math.max(1, totals.applied)
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <div key={s.label} className="grid grid-cols-[130px_1fr_90px] items-center gap-3">
          <span className="text-body">{s.label}</span>
          <Progress
            value={(s.value / max) * 100}
            aria-label={s.label}
            className="h-3 bg-card [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-chart-1"
          />
          <span className="text-right text-body tabular-nums">
            <span className="font-medium">{s.value}</span>
            {i > 0 && totals.applied > 0 && <span className="ml-1.5 text-muted-foreground">{Math.round((s.value / totals.applied) * 100)}%</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function FunnelTable({ title, description, rows }: { title: string; description: string; rows: JobFunnelRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-muted-foreground">Поки немає даних за період.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">Відгуків</TableHead>
                <TableHead className="text-right">Відповіді</TableHead>
                <TableHead className="text-right">Співбес.</TableHead>
                <TableHead className="text-right">Офери</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-48 truncate font-medium">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.applied}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.replied} <span className="text-muted-foreground">· {fmtPercent(r.replyRate)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.interview}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.offer} <span className="text-muted-foreground">· {fmtPercent(r.offerRate)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Job search analytics: funnel, weekly activity, which board / resume / letter works. */
export function JobStatsPage() {
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
          <Skeleton className="h-64 rounded-3xl" />
        ) : data.totals.applied === 0 ? (
          <EmptyState title="За період відгуків немає" hint="Додавайте вакансії зі статусом «Надіслано» — тут з’явиться воронка." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Воронка</CardTitle>
                <CardDescription>
                  {data.avgReplyDays !== null ? `У середньому відповідають за ${data.avgReplyDays} дн.` : 'Відповідей поки не було'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Funnel totals={data.totals} />
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
            <FunnelTable title="За майданчиками" description="Де відгукуватися вигідніше" rows={data.byBoard} />
            <FunnelTable title="За версіями резюме" description="Яка версія частіше отримує відповідь" rows={data.byResume} />
            <FunnelTable title="За шаблонами листів" description="Супровідні листи, які працюють" rows={data.byTemplate} />
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
                      <div key={s.kind} className="grid grid-cols-[110px_1fr_70px] items-center gap-3">
                        <span className="text-body">{STAGE_KIND_LABEL[s.kind]}</span>
                        <Progress
                          value={s.total ? (s.passed / s.total) * 100 : 0}
                          aria-label={STAGE_KIND_LABEL[s.kind]}
                          className="h-2.5 bg-card [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-chart-1"
                        />
                        <span className="text-right text-body tabular-nums">
                          {s.passed}/{s.total}
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
