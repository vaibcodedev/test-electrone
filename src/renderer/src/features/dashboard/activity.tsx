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

/**
 * Single series → one validated hue, no legend; exact values on hover (dataviz skill). Days with nothing done
 * draw no bar, so the baseline and a tick for every day carry the 14 slots: without them one active day reads
 * as a block floating in an empty card. The plot takes whatever height the row gives the card.
 */
export function Activity({ data }: { data: { day: string; count: number }[] }): ReactElement {
  const total = data.reduce((s, d) => s + d.count, 0)
  const rows = data.map((d) => ({ ...d, label: fmtDayFull(parseISO(d.day).getTime()) }))
  const today = data.at(-1)?.day
  return (
    <ListCard
      title="Зроблено за 2 тижні"
      className="col-span-4"
      contentClassName="flex flex-1 flex-col"
    >
      {total === 0 ? (
        // Fourteen identical stub bars read as a decorative dashed line: say it in words instead.
        <CardEmptyText>
          За два тижні ще нічого не закрито — перетягніть картку в колонку «Готово».
        </CardEmptyText>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div className="font-display text-stat leading-none tabular-nums">{total}</div>
          {/* basis-0: the height comes from the card, the chart never stretches the row itself. */}
          <ChartContainer
            config={activityConfig}
            className="aspect-auto min-h-32 w-full flex-1 basis-0"
          >
            <BarChart
              data={rows}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              barCategoryGap={2}
            >
              <XAxis
                dataKey="day"
                // A narrow card (the AI panel is open) skips ticks instead of overlapping them; today stays.
                interval="preserveEnd"
                minTickGap={2}
                tickFormatter={(day: string) => String(Number(day.slice(8)))}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tickMargin={6}
                tick={({ x, y, payload }) => (
                  <text
                    x={x}
                    y={y}
                    dy="0.71em"
                    textAnchor="middle"
                    fill={payload.value === today ? 'var(--foreground)' : 'var(--muted-foreground)'}
                    fontWeight={payload.value === today ? 600 : 400}
                  >
                    {Number(String(payload.value).slice(8))}
                  </text>
                )}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                  />
                }
              />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </ListCard>
  )
}
