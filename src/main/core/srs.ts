/**
 * Spaced repetition shared by English words and the interview question bank: SM-2 variant with
 * 4 grades (0 forgot · 1 hard · 2 good · 3 easy) and the learning stage derived from the interval.
 */
import type { ReviewGrade, WordStage } from '@shared/domain/english'
import { addDays, startOfDay } from './util'

export interface SrsState {
  ease: number
  intervalDays: number
  repetitions: number
  lapses: number
}

export interface SrsSchedule extends SrsState {
  dueAt: number
  lastReviewedAt: number
}

/** Columns the scheduler owns: never reverted by «Скасувати», not exported as record fields. */
export const SRS_FIELDS = ['ease', 'intervalDays', 'repetitions', 'lapses', 'dueAt', 'lastReviewedAt']

/** Interval (days) from which a reviewed item is «повторення» and «вивчено». */
export const REVIEW_DAYS = 7
export const MASTERED_DAYS = 30

export function stageOf(r: { intervalDays: number; lastReviewedAt: number | null }): WordStage {
  if (!r.lastReviewedAt) return 'new'
  if (r.intervalDays >= MASTERED_DAYS) return 'mastered'
  if (r.intervalDays >= REVIEW_DAYS) return 'review'
  return 'learning'
}

/** Pure SM-2 step. */
export function schedule(state: SrsState, grade: ReviewGrade, at: number): SrsSchedule {
  const q = [1, 3, 4, 5][grade]
  let { ease, intervalDays, repetitions, lapses } = state
  if (q < 3) {
    repetitions = 0
    lapses += 1
    intervalDays = 0
    ease = Math.max(1.3, ease - 0.2)
    // Show again in 10 minutes in the same session.
    return { ease, intervalDays, repetitions, lapses, dueAt: at + 10 * 60_000, lastReviewedAt: at }
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  if (repetitions === 0) intervalDays = q === 5 ? 3 : 1
  else if (repetitions === 1) intervalDays = q === 5 ? 7 : q === 3 ? 3 : 4
  else intervalDays = Math.round(intervalDays * ease * (q === 3 ? 0.8 : q === 5 ? 1.3 : 1))
  intervalDays = Math.min(intervalDays, 365)
  repetitions += 1
  return {
    ease,
    intervalDays,
    repetitions,
    lapses,
    dueAt: startOfDay(addDays(at, intervalDays)) + 4 * 3600_000,
    lastReviewedAt: at
  }
}
