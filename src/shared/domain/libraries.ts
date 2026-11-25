import { z } from 'zod'
import { MAX } from './limits'
import { favoriteFilter, idSchema, urlSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const LIBRARY_STATUSES = ['used', 'favorite', 'want', 'testing', 'dropped'] as const
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number]

export const LIBRARY_STATUS_LABEL: Record<LibraryStatus, string> = {
  used: 'Використовую',
  favorite: 'Улюблена',
  want: 'Хочу спробувати',
  testing: 'Пробую',
  dropped: 'Відкинуто'
}

export const libraryInputSchema = z.object({
  name: z.string().trim().min(1).max(MAX.name),
  purpose: z.string().max(MAX.short).default(''),
  notes: z.string().max(MAX.article).default(''),
  npmUrl: urlSchema.default(''),
  githubUrl: urlSchema.default(''),
  docsUrl: urlSchema.default(''),
  installCmd: z.string().max(MAX.line).default(''),
  status: z.enum(LIBRARY_STATUSES).default('want'),
  ...withTagIds
})
export const libraryPatchSchema = patchOf(libraryInputSchema)
export type LibraryInput = z.input<typeof libraryInputSchema>
export type LibraryPatch = z.input<typeof libraryPatchSchema>

export const libraryListQuerySchema = z.object({
  status: z.enum(LIBRARY_STATUSES).optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  ...favoriteFilter
})
export type LibraryListQuery = z.infer<typeof libraryListQuerySchema>

export interface Library extends EntityBase, WithTags {
  name: string
  purpose: string
  notes: string
  npmUrl: string
  githubUrl: string
  docsUrl: string
  installCmd: string
  status: LibraryStatus
}
