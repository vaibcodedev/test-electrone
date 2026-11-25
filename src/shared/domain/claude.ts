import { z } from 'zod'
import { MAX } from './limits'
import { favoriteFilter, idSchema, urlSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const CLAUDE_KINDS = ['note', 'branch', 'skill', 'plugin', 'guide', 'prompt'] as const
export type ClaudeKind = (typeof CLAUDE_KINDS)[number]

/** One record's kind (search, links, pins subtitles; the picker). */
export const CLAUDE_KIND_LABEL: Record<ClaudeKind, string> = {
  note: 'Нотатка',
  branch: 'Гілка',
  skill: 'Скіл',
  plugin: 'Плагін',
  guide: 'Гайд',
  prompt: 'Промт'
}

export const claudeInputSchema = z.object({
  kind: z.enum(CLAUDE_KINDS),
  title: z.string().trim().min(1).max(MAX.title),
  summary: z.string().max(1000).default(''),
  content: z.string().max(100_000).default(''),
  url: urlSchema.default(''),
  /** For prompts: marks prompts that worked well. */
  works: z.boolean().default(false),
  ...withTagIds
})
export const claudePatchSchema = patchOf(claudeInputSchema)
export type ClaudeInput = z.input<typeof claudeInputSchema>
export type ClaudePatch = z.input<typeof claudePatchSchema>

export const claudeListQuerySchema = z.object({
  kind: z.enum(CLAUDE_KINDS).optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  ...favoriteFilter
})
export type ClaudeListQuery = z.infer<typeof claudeListQuerySchema>

export interface ClaudeItem extends EntityBase, WithTags {
  kind: ClaudeKind
  title: string
  summary: string
  content: string
  url: string
  works: boolean
  copyCount: number
}
