import type { Goal, GoalMetric } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { fmtMoney, fmtPercent } from '@/lib/format'
import { GOAL_METRIC_LABEL } from './g2-labels'

/** `currency` — from `GoalProgress.currency` (server picks it); USD only when nothing is known. */
export function formatGoalValue(
  metric: GoalMetric,
  value: number,
  currency?: Currency | null
): string {
  if (metric === 'net_income') return fmtMoney(value, currency ?? 'USD')
  if (metric === 'reply_rate' || metric === 'hire_rate') return fmtPercent(value)
  return String(Math.round(value))
}

export function goalTitle(g: Pick<Goal, 'title' | 'metric' | 'period'>): string {
  return (
    g.title.trim() ||
    `${GOAL_METRIC_LABEL[g.metric]} за ${g.period === 'week' ? 'тиждень' : 'місяць'}`
  )
}
