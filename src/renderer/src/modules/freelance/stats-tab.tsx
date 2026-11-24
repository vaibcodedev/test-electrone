import { useState } from 'react'
import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { FunnelRow, Platform } from '@shared/domain/freelance'
import { useApi } from '@/lib/query'
import { LOCALE } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { EmptyState, Segmented } from '@/components/common/page'

const RANGES = [
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: '365', label: 'Год' }
] as const
type Range = (typeof RANGES)[number]['value']

/** Two series → validated pair (dataviz validator: light #6b8c00/#5b6be0 on surface; dark pair passes contrast & CVD). */
const weeklyConfig = {
  sent: { label: 'Отправлено', theme: { light: '#6b8c00', dark: '#d8f74a' } },
  replied: { label: 'Ответили', theme: { light: '#5b6be0', dark: '#8b98ff' } }
} satisfies ChartConfig

function Funnel({ totals }: { totals: FunnelRow }) {
  const steps = [
    { label: 'Отправлено', value: totals.sent },
    { label: 'Ответили', value: totals.replied },
    { label: 'Интервью', value: totals.interview },
    { label: 'Контракт', value: totals.hired }
  ]
  const max = Math.max(1, totals.sent)
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <div key={s.label} className="grid grid-cols-[110px_1fr_90px] items-center gap-3">
          <span className="text-body">{s.label}</span>
          <Progress
            value={(s.value / max) * 100}
            aria-label={s.label}
            className="h-3 bg-surface [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-chart-1"
          />
          <span className="text-right text-body tabular-nums">
            <span className="font-medium">{s.value}</span>
            {i > 0 && totals.sent > 0 && (
              <span className="ml-1.5 text-muted-foreground">{Math.round((s.value / totals.sent) * 100)}%</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function FunnelTable({ title, description, rows, creditsName }: { title: string; description: string; rows: FunnelRow[]; creditsName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-muted-foreground">Нет данных за период.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Группа</TableHead>
                <TableHead className="text-right">Откликов</TableHead>
                <TableHead className="text-right">Ответы</TableHead>
                <TableHead className="text-right">Контракты</TableHead>
                {creditsName && <TableHead className="text-right">{creditsName}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-[220px] truncate font-medium">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sent}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.replied} <span className="text-muted-foreground">· {r.replyRate}%</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.hired} <span className="text-muted-foreground">· {r.hireRate}%</span>
                  </TableCell>
                  {creditsName && <TableCell className="text-right tabular-nums">{r.credits}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Funnel, conversion by task type and template, weekly activity for one platform. */
export function StatsTab({ platform }: { platform: Platform }) {
  const [range, setRange] = useState<Range>('90')
  const [to] = useState(() => Date.now())
  const from = to - Number(range) * 86_400_000
  const { data: stats } = useApi('freelance', 'stats', { platformId: platform.id, from, to })

  if (!stats) return null
  const t = stats.totals
  const weekly = stats.weekly.map((w) => ({ ...w, label: format(new Date(w.week), 'd MMM', { locale: LOCALE }) }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        <span className="text-caption text-muted-foreground">
          {stats.avgReplyHours !== null
            ? `Клиенты отвечают в среднем за ${stats.avgReplyHours < 48 ? `${Math.round(stats.avgReplyHours)} ч` : `${Math.round(stats.avgReplyHours / 24)} дн.`}`
            : 'Ответов пока нет'}
        </span>
      </div>

      {t.sent === 0 ? (
        <EmptyState title="За этот период откликов нет" hint="Статистика появится, когда вы отправите несколько откликов." />
      ) : (
        <>
          <div className="stagger grid grid-cols-12 gap-3">
            <Card className="col-span-5">
              <CardHeader>
                <CardTitle>Воронка</CardTitle>
                <CardDescription>
                  Ответили на {t.replyRate}% откликов, контракт в {t.hireRate}%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Funnel totals={t} />
              </CardContent>
            </Card>
            <Card className="col-span-7">
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
                    <Bar dataKey="sent" fill="var(--color-sent)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="replied" fill="var(--color-replied)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FunnelTable
              title="По типам задач"
              description="Где вас чаще выбирают"
              rows={stats.byNiche}
              creditsName={platform.creditsName}
            />
            <FunnelTable
              title="По шаблонам"
              description="Какие тексты откликов работают лучше"
              rows={stats.byTemplate}
              creditsName={platform.creditsName}
            />
          </div>
        </>
      )}
    </div>
  )
}
