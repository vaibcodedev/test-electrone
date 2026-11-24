import { z } from 'zod'
import { idSchema, withTagIds, type EntityBase, type WithTags } from './common'

export const WORD_KINDS = ['word', 'phrase', 'idiom', 'term'] as const
export type WordKind = (typeof WORD_KINDS)[number]

export const wordInputSchema = z.object({
  term: z.string().trim().min(1).max(300),
  translation: z.string().trim().max(1000).default(''),
  kind: z.enum(WORD_KINDS).default('word'),
  transcription: z.string().max(200).default(''),
  example: z.string().max(2000).default(''),
  exampleTranslation: z.string().max(2000).default(''),
  /** Where it was met: "PR review", "Shopify docs"... */
  context: z.string().max(500).default(''),
  notes: z.string().max(10_000).default(''),
  ...withTagIds
})
export const wordPatchSchema = wordInputSchema.partial()
export type WordInput = z.input<typeof wordInputSchema>
export type WordPatch = z.input<typeof wordPatchSchema>

export const WORD_STAGES = ['new', 'learning', 'review', 'mastered'] as const
export type WordStage = (typeof WORD_STAGES)[number]

export const wordListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  kind: z.enum(WORD_KINDS).optional(),
  stage: z.enum(WORD_STAGES).optional(),
  tagId: idSchema.optional()
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
export const reviewInputSchema = z.object({ id: idSchema, grade: reviewGradeSchema })

export interface EnglishStats {
  total: number
  due: number
  byStage: Record<WordStage, number>
  reviewedToday: number
  streakDays: number
}
