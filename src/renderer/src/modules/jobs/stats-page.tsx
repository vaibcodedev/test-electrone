import { useState } from 'react'
import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { JobFunnelRow } from '@shared/domain/jobs'
import { useApi } from '@/lib/query'
import { LOCALE } from '@/lib/format'
import { EmptyState, Page, PageBody, PageHeader, Segmented } from '@/components/common/page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { STAGE_KIND_LABEL } from './j2-labels'

const RANGES = [
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: '365', label: 'Год' }
] as const
type Range = (typeof RANGES)[number]['value']

/** Two series → the validated pair already used in freelance stats (passes contrast & CVD in both themes). */
const weeklyConfig = {
  applied: { label: 'Отклики', theme: { light: '#6b8c00', dark: '#d8f74a' } },
  replied: { label: 'Ответили', theme: { light: '#5b6be0', dark: '#8b98ff' } }
} satisfies ChartConfig

function Funnel({ totals }: { totals: JobFunnelRow }) {
  const steps = [
    { label: 'Отклики', value: totals.applied },
    { label: 'Ответили', value: totals.replied },
    { label: 'Собеседования', value: totals.interview },
    { label: 'Офферы', value: totals.offer }
  ]
  const max = Math.max(1, totals.applied)
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <div key={s.label} className="grid grid-cols-[130px_1fr_90px] items-center gap-3">
          <span className="text-[13px]">{s.label}</span>
          <Progress
            value={(s.value / max) * 100}
            aria-label={s.label}
            className="h-3 bg-card [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-chart-1"
          />
          <span className="text-right text-[13px] tabular-nums">
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
          <p className="text-[13px] text-muted-foreground">Пока нет данных за период.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">Откликов</TableHead>
                <TableHead className="text-right">Ответы</TableHead>
                <TableHead className="text-right">Собес.</TableHead>
                <TableHead className="text-right">Офферы</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-48 truncate font-medium">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.applied}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.replied} <span className="text-muted-foreground">· {r.replyRate}%</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.interview}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.offer} <span className="text-muted-foreground">· {r.offerRate}%</span>
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
  const [now] = useState(() => Date.now())
  const { data } = useApi('jobs', 'stats', { from: now - Number(range) * 86_400_000, to: now })
  const weekly = (data?.weekly ?? []).map((w) => ({ ...w, label: format(new Date(w.week), 'd MMM', { locale: LOCALE }) }))

  return (
    <Page>
      <PageHeader
        title="Статистика поиска"
        subtitle="Какие площадки, версии резюме и письма дают ответы."
        actions={<Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />}
      />
      <PageBody>
        {!data ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : data.totals.applied === 0 ? (
          <EmptyState title="За период откликов нет" hint="Добавляйте вакансии со статусом «Отправлено» — здесь появится воронка." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Воронка</CardTitle>
                <CardDescription>
                  {data.avgReplyDays !== null ? `В среднем отвечают за ${data.avgReplyDays} дн.` : 'Ответов пока не было'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Funnel totals={data.totals} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>По неделям</CardTitle>
                <CardDescription>Сколько откликов отправлено и на сколько ответили</CardDescription>
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
            <FunnelTable title="По площадкам" description="Где откликаться выгоднее" rows={data.byBoard} />
            <FunnelTable title="По версиям резюме" description="Какая версия чаще получает ответ" rows={data.byResume} />
            <FunnelTable title="По шаблонам писем" description="Сопроводительные, которые работают" rows={data.byTemplate} />
            <Card>
              <CardHeader>
                <CardTitle>Этапы</CardTitle>
                <CardDescription>Сколько этапов пройдено успешно</CardDescription>
              </CardHeader>
              <CardContent>
                {data.stagesByKind.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Этапов за период не было.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.stagesByKind.map((s) => (
                      <div key={s.kind} className="grid grid-cols-[110px_1fr_70px] items-center gap-3">
                        <span className="text-[13px]">{STAGE_KIND_LABEL[s.kind]}</span>
                        <Progress
                          value={s.total ? (s.passed / s.total) * 100 : 0}
                          aria-label={STAGE_KIND_LABEL[s.kind]}
                          className="h-2.5 bg-card [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-chart-1"
                        />
                        <span className="text-right text-[13px] tabular-nums">
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
