/** Daily goal of the English trainer, pure: which entries today's session holds, the streak, the chart days. */
import type { EnglishDay } from '@shared/domain/english'
import { addDays, dayKey } from '../core/util'

export interface DailyGoal {
  newPerDay: number
  reviewsPerDay: number
}

export interface DoneToday {
  newDone: number
  reviewsDone: number
}

export function sessionLimits(goal: DailyGoal, done: DoneToday): { newLeft: number; reviewsLeft: number } {
  return {
    newLeft: Math.max(0, goal.newPerDay - done.newDone),
    reviewsLeft: Math.max(0, goal.reviewsPerDay - done.reviewsDone)
  }
}

/**
 * Reviews first (oldest due first), then new entries up to what is left of the goal. An entry already answered
 * today (forgotten, back in 10 minutes) doesn't spend the cap a second time: it was counted when first touched.
 */
export function pickSession<T extends { id: string }>(
  due: T[],
  fresh: T[],
  touchedToday: ReadonlySet<string>,
  limits: { newLeft: number; reviewsLeft: number }
): T[] {
  const reviews: T[] = []
  let budget = limits.reviewsLeft
  for (const w of due) {
    if (touchedToday.has(w.id)) reviews.push(w)
    else if (budget > 0) {
      reviews.push(w)
      budget--
    }
  }
  return [...reviews, ...fresh.slice(0, limits.newLeft)]
}

/** Days in a row with at least one answer, ending today — or yesterday, while today has none yet. */
export function streakOf(days: ReadonlySet<string>, today: number): number {
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1)
  let n = 0
  while (days.has(dayKey(cursor))) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

/** `count` days ending today, oldest first, from answers and first-study times. */
export function chartDays(
  answers: { at: number; grade: number }[],
  firstStudied: number[],
  today: number,
  count: number
): EnglishDay[] {
  const days = Array.from({ length: count }, (_, i) => dayKey(addDays(today, i - count + 1)))
  const byDay = new Map(days.map((day) => [day, { day, answers: 0, correct: 0, newWords: 0 }]))
  for (const a of answers) {
    const d = byDay.get(dayKey(a.at))
    if (!d) continue
    d.answers++
    if (a.grade > 0) d.correct++
  }
  for (const at of firstStudied) {
    const d = byDay.get(dayKey(at))
    if (d) d.newWords++
  }
  return days.map((day) => byDay.get(day)!)
}
