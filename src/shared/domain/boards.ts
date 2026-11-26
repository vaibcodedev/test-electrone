import { z } from 'zod'
import { MAX } from './limits'
import {
  hexColorSchema,
  idSchema,
  timestampSchema,
  withTagIds,
  type EntityBase,
  type WithTags,
  patchOf,
  pageSchema
} from './common'

/** boards.list filters: a CRM project's boards (the «Дошка» button on the project page). */
export const boardListSchema = pageSchema.extend({ projectId: idSchema.optional() })
export interface BoardListQuery {
  projectId?: string
}

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

export const boardInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(MAX.article).default(''),
  color: hexColorSchema.default(null),
  projectId: idSchema.nullable().default(null),
  ...withTagIds
})
export const boardPatchSchema = patchOf(boardInputSchema).extend({
  archived: z.boolean().optional()
})
export type BoardInput = z.input<typeof boardInputSchema>
export type BoardPatch = z.input<typeof boardPatchSchema>

export interface Board extends EntityBase, WithTags {
  title: string
  description: string
  color: string | null
  projectId: string | null
  ideaId: string | null
  archived: boolean
}

export interface BoardSummary extends Board {
  cardCount: number
  doneCount: number
  overdueCount: number
}

export const columnInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.label),
  color: hexColorSchema.default(null),
  isDone: z.boolean().default(false)
})
export const columnPatchSchema = patchOf(columnInputSchema)
export type ColumnInput = z.input<typeof columnInputSchema>
export type ColumnPatch = z.input<typeof columnPatchSchema>

export interface BoardColumn {
  id: string
  boardId: string
  title: string
  color: string | null
  isDone: boolean
  position: number
}

/** ISO weekdays of a weekly repeat: 1 = понеділок … 7 = неділя. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * How a card repeats: once it lands in a «Готово» column, the next card of the series is created. A monthly repeat
 * keeps the intended day of the month (`day`, 1–31): «31-го» goes 31 січня → 28 лютого → 31 березня. Main fills it
 * from the deadline (or today) and resets it when the deadline is moved to another day.
 */
export const cardRepeatSchema = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('daily') }),
  z.object({
    freq: z.literal('weekly'),
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
  }),
  z.object({ freq: z.literal('monthly'), day: z.number().int().min(1).max(31).optional() })
])
export type CardRepeat = z.infer<typeof cardRepeatSchema>
export type RepeatFreq = CardRepeat['freq']

export const cardInputSchema = z.object({
  boardId: idSchema,
  columnId: idSchema,
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(MAX.article).default(''),
  priority: z.enum(PRIORITIES).default('none'),
  dueAt: timestampSchema.nullable().default(null),
  repeat: cardRepeatSchema.nullable().default(null),
  ...withTagIds
})
export const cardPatchSchema = patchOf(cardInputSchema.omit({ boardId: true }))
export type CardInput = z.input<typeof cardInputSchema>
export type CardPatch = z.input<typeof cardPatchSchema>

export interface Card extends EntityBase, WithTags {
  boardId: string
  columnId: string
  title: string
  description: string
  priority: Priority
  dueAt: number | null
  position: number
  completedAt: number | null
  /** null — the card doesn't repeat. */
  repeat: CardRepeat | null
  /** The next card of the series, once it was created (a card spawns one successor at most). */
  repeatNextId: string | null
  checklistTotal: number
  checklistDone: number
}

/**
 * What a move into «Готово» did to repeating cards. Optional on purpose: an older main returns nothing, and the
 * renderer reads `outcome?.spawned`.
 */
export interface CardRepeatOutcome {
  /** The next cards of their series, created by this move. */
  spawned?: { id: string; title: string; dueAt: number }[]
  /** Titles of repeating cards whose next card wasn't created: the board has no column that isn't «Готово». */
  blocked?: string[]
}

export interface ChecklistEntry {
  id: string
  cardId: string
  text: string
  done: boolean
  position: number
}

export interface CardDetails extends Card {
  checklist: ChecklistEntry[]
  boardTitle: string
  columnTitle: string
  /** Set by `cards.update` when the change of column moved the card into «Готово». */
  repeatOutcome?: CardRepeatOutcome
}

export interface BoardDetails {
  board: Board
  columns: BoardColumn[]
  cards: Card[]
}

export const cardMoveSchema = z.object({
  cardId: idSchema,
  columnId: idSchema,
  /** Index inside the target column after the move. */
  index: z.number().int().min(0)
})
export type CardMove = z.infer<typeof cardMoveSchema>

/** A sub-task line of a card (both processes: main validates, the card sheet limits the input). */
export const cardCheckInputSchema = z.object({ text: z.string().trim().min(1).max(1000) })

export interface DueCard extends Card {
  boardTitle: string
  columnTitle: string
  columnIsDone: boolean
}
