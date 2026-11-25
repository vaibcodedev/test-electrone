import { z } from 'zod'
import { MAX } from './limits'
import {
  hexColorSchema,
  idSchema,
  timestampSchema,
  withTagIds,
  type EntityBase,
  type WithTags,
  patchOf
} from './common'

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

export const boardInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(20_000).default(''),
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

export const cardInputSchema = z.object({
  boardId: idSchema,
  columnId: idSchema,
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(100_000).default(''),
  priority: z.enum(PRIORITIES).default('none'),
  dueAt: timestampSchema.nullable().default(null),
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
  checklistTotal: number
  checklistDone: number
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
