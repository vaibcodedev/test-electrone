import type { ReactElement } from 'react'
import { parseISO } from 'date-fns'
import { Bar, BarChart, XAxis } from 'recharts'
import { fmtDayFull } from '@/lib/format'
import { CardEmptyText, ListCard } from '@/components/common/list-card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'

const activityConfig = {
  count: { label: 'Зроблено', color: 'var(--chart-1)' }
} satisfies ChartConfig

/** Single series → one validated hue, no legend; exact values on hover (dataviz skill). */
export function Activity({ data }: { data: { day: string; count: number }[] }): ReactElement {
  const total = data.reduce((s, d) => s + d.count, 0)
  const rows = data.map((d) => ({ ...d, label: fmtDayFull(parseISO(d.day).getTime()) }))
  return (
    <ListCard title="Зроблено за 2 тижні" className="col-span-4">
      {total === 0 ? (
        // Fourteen identical stub bars read as a decorative dashed line: say it in words instead.
        <CardEmptyText>
          За два тижні ще нічого не закрито — перетягніть картку в колонку «Готово».
        </CardEmptyText>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="font-display text-stat leading-none tabular-nums">{total}</div>
          <ChartContainer config={activityConfig} className="aspect-auto h-28 w-full">
            <BarChart
              data={rows}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              barCategoryGap={2}
            >
              <XAxis dataKey="label" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </ListCard>
  )
}
