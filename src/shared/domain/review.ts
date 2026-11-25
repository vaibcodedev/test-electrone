/** Weekly review: a snapshot of the week + your own summary and plan. */
import { z } from 'zod'
import type { EntitySummary } from './common'
import type { MoneyByCurrency } from './finance'

export interface WeekMetric {
  key: string
  label: string
  value: number
  previous: number
  /** How to format: count, minutes, percent. */
  unit: 'count' | 'minutes' | 'percent'
  /** Higher is better (for the trend arrow colour). */
  better: 'up' | 'down'
}

export interface WeekSection {
  id: 'work' | 'freelance' | 'jobs' | 'money' | 'learning' | 'code'
  title: string
  metrics: WeekMetric[]
}

export interface WeekSnapshot {
  weekStart: string // yyyy-mm-dd (Monday)
  from: number
  to: number
  sections: WeekSection[]
  money: { net: MoneyByCurrency; expenses: MoneyByCurrency; profit: MoneyByCurrency }
  /** Things still hanging: stale proposals, applications without answer, overdue cards, unpaid subscriptions. */
  pending: { title: string; items: (EntitySummary & { route?: string })[] }[]
  /** Finished this week (cards, checklists, contracts…). */
  done: EntitySummary[]
  /** `allDay` is missing in snapshots frozen by older versions. */
  upcoming: { title: string; at: number; route: string; allDay?: boolean }[]
}

export interface WeeklyReview {
  id: string
  weekStart: string
  snapshot: WeekSnapshot
  /** Your own words: what went well / badly. */
  summary: string
  /** Plan for the next week. */
  plan: string
  createdAt: number
  updatedAt: number
}

export const reviewNotesSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().max(50_000).optional(),
  plan: z.string().max(50_000).optional()
})
export type ReviewNotesInput = z.input<typeof reviewNotesSchema>
