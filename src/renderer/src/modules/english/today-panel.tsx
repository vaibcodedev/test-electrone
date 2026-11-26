import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { parseISO } from 'date-fns'
import { Brain, CircleCheck, Flame } from 'lucide-react'
import { Bar, BarChart, PolarAngleAxis, RadialBar, RadialBarChart, XAxis } from 'recharts'
import type { EnglishStats } from '@shared/domain/english'
import { fmtDayFull, fmtNumber, fmtPercent, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Segmented } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'

const ringConfig = { done: { label: 'Готово', color: 'var(--chart-1)' } } satisfies ChartConfig
const barsConfig = {
  answers: { label: 'Відповідей', color: 'var(--chart-1)' }
} satisfies ChartConfig

type Period = 'week' | 'month'
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30 }

const days = (n: number): string => `${n} ${plural(n, ['день', 'дні', 'днів'])}`

/**
 * The day's goal as a ring (one value, one validated hue — dataviz): what is done of what today's session holds.
 * The words beside it carry the numbers; the ring is their picture.
 */
function TodayRing({ done, total }: { done: number; total: number }): ReactElement {
  const pct = total ? Math.round((done / total) * 100) : 100
  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`Готово ${done} з ${total}`}>
      <ChartContainer config={ringConfig} className="aspect-square size-16">
        <RadialBarChart
          data={[{ done: pct }]}
          startAngle={90}
          endAngle={-270}
          innerRadius={25}
          outerRadius={32}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="done"
            fill="var(--color-done)"
            cornerRadius={8}
            background={{ fill: 'var(--foreground)', fillOpacity: 0.09 }}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ChartContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        {total && done >= total ? (
          <CircleCheck className="size-6 text-success" />
        ) : (
          <span className="text-body font-semibold tabular-nums">{pct}%</span>
        )}
      </div>
    </div>
  )
}

/** Answers per day: single series, exact numbers on hover, today's tick bold (docs/design-system.md → Графіки). */
function AnswersChart({ data }: { data: EnglishStats['days'] }): ReactElement {
  const today = data.at(-1)?.day
  const rows = data.map((d) => ({
    ...d,
    label: `${fmtDayFull(parseISO(d.day).getTime())}: нових ${d.newWords}, правильно ${d.correct}`
  }))
  return (
    <ChartContainer config={barsConfig} className="aspect-auto h-16 w-full">
      <BarChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
        <XAxis
          dataKey="day"
          interval="preserveEnd"
          minTickGap={4}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickMargin={4}
          height={20}
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
        <Bar dataKey="answers" fill="var(--color-answers)" radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  )
}

function Total({
  label,
  value,
  hint
}: {
  label: string
  value: number
  hint: string
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className="flex cursor-help flex-col gap-0.5 rounded-xl px-1 outline-offset-2"
        >
          <span className="font-display text-stat-sm leading-none tabular-nums">
            {fmtNumber(value)}
          </span>
          <span className="text-meta text-muted-foreground">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{hint}</TooltipContent>
    </Tooltip>
  )
}

/**
 * «Сьогодні» over the dictionary: the daily goal (ring, new and reviews), the streak, the week or month of answers
 * with accuracy, totals by stage, and the one way into the trainer — «Тренуватися».
 */
export function TodayPanel({ stats }: { stats: EnglishStats }): ReactElement {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('week')
  const t = stats.today
  const done = t.newDone + t.reviewsDone
  const left = stats.due
  const shown = stats.days.slice(-PERIOD_DAYS[period])
  const answers = shown.reduce((s, d) => s + d.answers, 0)
  const correct = shown.reduce((s, d) => s + d.correct, 0)
  const learned = shown.reduce((s, d) => s + d.newWords, 0)
  const learning = stats.byStage.learning + stats.byStage.review

  return (
    <div className="@container">
      <div className="grid items-center gap-3 rounded-3xl bg-surface p-3 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto]">
        <div className="flex min-w-0 items-center gap-3 pl-1">
          <TodayRing done={done} total={done + left} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="text-lead font-medium">
              Сьогодні: {t.newDone} з {t.newGoal} {plural(t.newGoal, ['нового', 'нових', 'нових'])}{' '}
              · {t.reviewsDone} {plural(t.reviewsDone, ['повторення', 'повторення', 'повторень'])}
            </div>
            <div className="text-caption text-muted-foreground">
              {left
                ? `Ще ${left} ${plural(left, ['картка', 'картки', 'карток'])} у тренуванні`
                : t.reviewsWaiting
                  ? 'Ліміт повторень на сьогодні вичерпано — решта чекає завтра'
                  : 'На сьогодні все — ціль виконано'}
            </div>
            <div
              className={cn(
                'flex items-center gap-1.5 text-caption',
                stats.streakDays ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <Flame
                className={cn('size-3.5', stats.streakDays ? 'fill-warn-fill text-warn-fill' : '')}
                aria-hidden
              />
              {stats.streakDays
                ? `${days(stats.streakDays)} поспіль`
                : 'Потренуйтеся сьогодні, щоб почати серію'}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-card px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-caption text-muted-foreground">
              {answers
                ? `${learned} ${plural(learned, ['нове', 'нових', 'нових'])} · ${answers} ${plural(answers, ['відповідь', 'відповіді', 'відповідей'])} · точність ${fmtPercent(Math.round((correct / answers) * 1000) / 10)}`
                : period === 'week'
                  ? 'За тиждень ще не тренувалися'
                  : 'За місяць ще не тренувалися'}
            </span>
            <Segmented
              size="xs"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'week', label: 'Тиждень' },
                { value: 'month', label: 'Місяць' }
              ]}
            />
          </div>
          <AnswersChart data={shown} />
        </div>

        <div className="flex items-center justify-between gap-5 pr-1 @3xl:justify-end">
          <div className="flex gap-4">
            <Total
              label="вивчено"
              value={stats.byStage.mastered}
              hint="Інтервал повторення — від 30 днів: слово закріпилося."
            />
            <Total
              label="вчу"
              value={learning}
              hint="Уже в тренуванні: «Вчу» і «Повторюю» разом."
            />
            <Total label="нові" value={stats.byStage.new} hint="Ще жодного разу не тренувалися." />
          </div>
          {/* One way in: due reviews and new words of the goal, or — when the day is done — practice beyond it. */}
          <Button variant={left ? 'lime' : 'soft'} onClick={() => navigate('/english/review')}>
            <Brain /> Тренуватися
          </Button>
        </div>
      </div>
    </div>
  )
}
