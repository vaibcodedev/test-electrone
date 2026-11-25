import { z } from 'zod'
import { MAX } from './limits'
import { idSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const IDEA_STATUSES = [
  'inbox',
  'thinking',
  'planned',
  'in_progress',
  'done',
  'dropped'
] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  inbox: 'Вхідні',
  thinking: 'Обмірковую',
  planned: 'У планах',
  in_progress: 'У роботі',
  done: 'Зроблено',
  dropped: 'Відмовився'
}

export const ideaInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  body: z.string().max(100_000).default(''),
  status: z.enum(IDEA_STATUSES).default('inbox'),
  /** 0..3 — how much it matters. */
  impact: z.number().int().min(0).max(3).default(0),
  ...withTagIds
})
export const ideaPatchSchema = patchOf(ideaInputSchema)
export type IdeaInput = z.input<typeof ideaInputSchema>
export type IdeaPatch = z.input<typeof ideaPatchSchema>

export const ideaListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  tagId: idSchema.optional()
})
export type IdeaListQuery = z.infer<typeof ideaListQuerySchema>

export interface Idea extends EntityBase, WithTags {
  title: string
  body: string
  status: IdeaStatus
  impact: number
  boardId: string | null
}
