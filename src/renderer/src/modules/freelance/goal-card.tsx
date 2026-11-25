import { useState, type ReactNode, type ReactElement } from 'react'
import { differenceInCalendarDays, isSameMonth } from 'date-fns'
import { Check } from 'lucide-react'
import type { GoalMetric, GoalProgress } from '@shared/domain/freelance'
import { fmtDate, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { GOAL_PERIOD_LABEL } from './g2-labels'
import { formatGoalValue, goalTitle } from './goal-format'

type GoalStatus = { label: string; variant: 'success' | 'warn' | 'soft' }

/** What is still missing, as a noun: «Ще 7 відгуків», not a bare «Ще 7». Money and % carry their own unit. */
const COUNT_FORMS: Partial<Record<GoalMetric, [string, string, string]>> = {
  proposals: ['відгук', 'відгуки', 'відгуків'],
  replies: ['відповідь', 'відповіді', 'відповідей'],
  contracts: ['контракт', 'контракти', 'контрактів']
}

/** Done / behind (period >70% over, progress <50%) / in progress. */
function goalStatus(g: GoalProgress, now: number): GoalStatus {
  if (g.ratio >= 1) return { label: 'Виконано', variant: 'success' }
  const span = Math.max(1, g.periodEnd - g.periodStart)
  const elapsed = (now - g.periodStart) / span
  if (elapsed > 0.7 && g.ratio < 0.5) return { label: 'Відстає', variant: 'warn' }
  return { label: 'У процесі', variant: 'soft' }
}

/** «23–29 листопада»; across months «30 листопада – 6 грудня». */
function periodRange(start: number, end: number): string {
  return isSameMonth(start, end)
    ? `${fmtDate(start, 'd')}–${fmtDate(end, 'd MMMM')}`
    : `${fmtDate(start, 'd MMMM')} – ${fmtDate(end, 'd MMMM')}`
}

/** Progress card (goals page and freelance overview): status badge, bar, «ще N · залишилось M днів». */
export function GoalCard({
  g,
  platformName,
  actions
}: {
  g: GoalProgress
  platformName?: string
  actions?: ReactNode
}): ReactElement {
  const [now] = useState(() => Date.now())
  const done = g.ratio >= 1
  const status = goalStatus(g, now)
  // `periodEnd` is the last millisecond of the period: 0 calendar days ahead means today is the last one.
  const daysAfterToday = Math.max(0, differenceInCalendarDays(g.periodEnd, now))
  const daysLeft = daysAfterToday + 1
  const remaining = Math.max(0, g.target - g.current)
  const forms = COUNT_FORMS[g.metric]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{goalTitle(g)}</CardTitle>
        <CardAction className="flex items-center gap-1">
          <Badge variant={status.variant}>
            {done && <Check />}
            {status.label}
          </Badge>
          {actions}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-stat leading-none tabular-nums">
            {formatGoalValue(g.metric, g.current, g.currency)}
          </span>
          <span className="text-body text-muted-foreground">
            з {formatGoalValue(g.metric, g.target, g.currency)}
          </span>
        </div>
        <Progress
          value={Math.min(100, g.ratio * 100)}
          aria-label="Прогрес цілі"
          className={cn(
            'h-2',
            done
              ? '*:data-[slot=progress-indicator]:bg-success-fill'
              : '*:data-[slot=progress-indicator]:bg-chart-1'
          )}
        />
        {/* Done: the number and the badge already say it; only an overshoot is worth a line. */}
        {done ? (
          g.current > g.target && (
            <p className="text-caption text-success">
              Перевиконано на {formatGoalValue(g.metric, g.current - g.target, g.currency)}
            </p>
          )
        ) : (
          <p className="text-caption text-muted-foreground">
            Ще {formatGoalValue(g.metric, remaining, g.currency)}
            {forms && ` ${plural(Math.round(remaining), forms)}`} ·{' '}
            {daysAfterToday > 0
              ? `залишилось ${daysLeft} ${plural(daysLeft, ['день', 'дні', 'днів'])}`
              : 'останній день'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-meta text-muted-foreground">
          <span>
            {GOAL_PERIOD_LABEL[g.period]}: {periodRange(g.periodStart, g.periodEnd)}
          </span>
          {platformName && <Badge variant="soft">{platformName}</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}
