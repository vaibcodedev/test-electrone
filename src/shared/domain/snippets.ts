import { z } from 'zod'
import { MAX } from './limits'
import { favoriteFilter, idSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const SNIPPET_LANGUAGES = [
  'typescript',
  'javascript',
  'tsx',
  'graphql',
  'liquid',
  'css',
  'html',
  'json',
  'bash',
  'sql',
  'markdown',
  'text'
] as const
export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number]

export const snippetInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(10_000).default(''),
  code: z.string().max(500_000).default(''),
  language: z.enum(SNIPPET_LANGUAGES).default('typescript'),
  ...withTagIds
})
export const snippetPatchSchema = patchOf(snippetInputSchema)
export type SnippetInput = z.input<typeof snippetInputSchema>
export type SnippetPatch = z.input<typeof snippetPatchSchema>

export const snippetListQuerySchema = z.object({
  language: z.enum(SNIPPET_LANGUAGES).optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  ...favoriteFilter
})
export type SnippetListQuery = z.infer<typeof snippetListQuerySchema>

export interface Snippet extends EntityBase, WithTags {
  title: string
  description: string
  code: string
  language: SnippetLanguage
  copyCount: number
}
