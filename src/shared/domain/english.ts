import { z } from 'zod'
import { MAX } from './limits'
import { favoriteFilter, idSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const WORD_KINDS = ['word', 'phrase', 'idiom', 'term'] as const
export type WordKind = (typeof WORD_KINDS)[number]

export const wordInputSchema = z.object({
  term: z.string().trim().min(1).max(300),
  translation: z.string().trim().max(1000).default(''),
  kind: z.enum(WORD_KINDS).default('word'),
  transcription: z.string().max(200).default(''),
  example: z.string().max(MAX.short).default(''),
  exampleTranslation: z.string().max(MAX.short).default(''),
  /** Where it was met: "PR review", "Shopify docs"... */
  context: z.string().max(MAX.line).default(''),
  notes: z.string().max(MAX.note).default(''),
  ...withTagIds
})
export const wordPatchSchema = patchOf(wordInputSchema)
export type WordInput = z.input<typeof wordInputSchema>
export type WordPatch = z.input<typeof wordPatchSchema>

export const WORD_STAGES = ['new', 'learning', 'review', 'mastered'] as const
export type WordStage = (typeof WORD_STAGES)[number]

export const wordListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  kind: z.enum(WORD_KINDS).optional(),
  stage: z.enum(WORD_STAGES).optional(),
  tagId: idSchema.optional(),
  ...favoriteFilter
})
export type WordListQuery = z.infer<typeof wordListQuerySchema>

export interface Word extends EntityBase, WithTags {
  term: string
  translation: string
  kind: WordKind
  transcription: string
  example: string
  exampleTranslation: string
  context: string
  notes: string
  /** SM-2 spaced repetition state. */
  ease: number
  intervalDays: number
  repetitions: number
  lapses: number
  dueAt: number
  lastReviewedAt: number | null
  stage: WordStage
}

/** 0 = forgot, 1 = hard, 2 = good, 3 = easy */
export const reviewGradeSchema = z.number().int().min(0).max(3)
export type ReviewGrade = z.infer<typeof reviewGradeSchema>
/** `extra` = practice beyond the schedule: only «Не згадав» changes the schedule (lapse). */
export const reviewInputSchema = z.object({ id: idSchema, grade: reviewGradeSchema, extra: z.boolean().optional() })

export interface EnglishStats {
  total: number
  due: number
  byStage: Record<WordStage, number>
  reviewedToday: number
  streakDays: number
  /** When the next word not due yet becomes due (null: none). */
  nextDueAt: number | null
}
