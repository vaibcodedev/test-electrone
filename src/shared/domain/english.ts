import { z } from 'zod'
import { MAX } from './limits'
import { favoriteFilter, idSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

/** Vocabulary kinds (the «Тип» of a word). */
export const WORD_KINDS = ['word', 'phrase', 'idiom', 'term'] as const
export type WordKind = (typeof WORD_KINDS)[number]
/**
 * Every kind of dictionary entry: the vocabulary kinds plus a grammar «Правило» (term = its name, translation =
 * the rule in short, example = practice sentences with [gaps], see shared/english-gaps.ts). One table and one
 * spaced repetition for both: search, tags, trash and statistics work for rules unchanged.
 */
export const ENTRY_KINDS = [...WORD_KINDS, 'rule'] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

export const wordInputSchema = z.object({
  term: z.string().trim().min(1).max(300),
  translation: z.string().trim().max(1000).default(''),
  kind: z.enum(ENTRY_KINDS).default('word'),
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
  kind: z.enum(ENTRY_KINDS).optional(),
  stage: z.enum(WORD_STAGES).optional(),
  tagId: idSchema.optional(),
  ...favoriteFilter
})
export type WordListQuery = z.infer<typeof wordListQuerySchema>

export interface Word extends EntityBase, WithTags {
  term: string
  translation: string
  kind: EntryKind
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

/** Today against the daily goal (settings `englishNewPerDay` / `englishReviewsPerDay`). */
export interface EnglishToday {
  /** Entries studied for the first time today, and the goal for them. */
  newDone: number
  newGoal: number
  /** Entries learned before today and reviewed today (each counted once). */
  reviewsDone: number
  /** What today's session still holds: due reviews up to the cap, then new entries up to the goal. */
  reviewsLeft: number
  newLeft: number
}

/** One local day of the statistics chart. */
export interface EnglishDay {
  /** dayKey: «2026-11-26». */
  day: string
  answers: number
  /** Answers other than «Не згадали». */
  correct: number
  /** Entries studied for the first time that day. */
  newWords: number
}

export interface EnglishStats {
  total: number
  /** Left in today's session: the trainer shows exactly these. */
  due: number
  byStage: Record<WordStage, number>
  reviewedToday: number
  streakDays: number
  /** When the next word not due yet becomes due (null: none). */
  nextDueAt: number | null
  today: EnglishToday
  /** The last 30 days, oldest first, today last. */
  days: EnglishDay[]
}

/** Rows of a CSV / TSV / Anki file mapped to entries; `dryRun` only counts what would be added. */
export const IMPORT_WORDS_MAX = 10_000
const importCell = z.string().max(10_000)
export const wordImportSchema = z.object({
  rows: z
    .array(z.object({ term: importCell, translation: importCell, example: importCell }))
    .max(IMPORT_WORDS_MAX),
  dryRun: z.boolean().optional()
})
export type WordImportInput = z.input<typeof wordImportSchema>
export interface WordImportResult {
  added: number
  /** Already in the dictionary or repeated in the file. */
  duplicates: number
  /** No word, or a field longer than an entry allows. */
  invalid: number
}

/** Daily goal limits (settings, «Налаштування тренування»). */
export const ENGLISH_NEW_PER_DAY = { min: 0, max: 200, default: 10 } as const
export const ENGLISH_REVIEWS_PER_DAY = { min: 1, max: 1000, default: 100 } as const
export const ENGLISH_ACCENTS = ['en-US', 'en-GB'] as const
export type EnglishAccent = (typeof ENGLISH_ACCENTS)[number]
