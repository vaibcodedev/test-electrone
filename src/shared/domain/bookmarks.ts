import { z } from 'zod'
import { MAX } from './limits'
import { favoriteFilter, idSchema, urlSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const BOOKMARK_KINDS = ['article', 'video', 'course', 'docs', 'repo', 'other'] as const
export type BookmarkKind = (typeof BOOKMARK_KINDS)[number]
export const BOOKMARK_STATUSES = ['queue', 'in_progress', 'done', 'dropped'] as const
export type BookmarkStatus = (typeof BOOKMARK_STATUSES)[number]

export const bookmarkInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  url: urlSchema.default(''),
  kind: z.enum(BOOKMARK_KINDS).default('article'),
  status: z.enum(BOOKMARK_STATUSES).default('queue'),
  progress: z.number().int().min(0).max(100).default(0),
  rating: z.number().int().min(0).max(5).default(0),
  notes: z.string().max(MAX.note).default(''),
  ...withTagIds
})
export const bookmarkPatchSchema = patchOf(bookmarkInputSchema)
export type BookmarkInput = z.input<typeof bookmarkInputSchema>
export type BookmarkPatch = z.input<typeof bookmarkPatchSchema>

export const bookmarkListQuerySchema = z.object({
  kind: z.enum(BOOKMARK_KINDS).optional(),
  status: z.enum(BOOKMARK_STATUSES).optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  ...favoriteFilter
})
export type BookmarkListQuery = z.infer<typeof bookmarkListQuerySchema>

export interface Bookmark extends EntityBase, WithTags {
  title: string
  url: string
  kind: BookmarkKind
  status: BookmarkStatus
  progress: number
  rating: number
  notes: string
  finishedAt: number | null
}
