import { z } from 'zod'
import { MAX } from './limits'
import { favoriteFilter, idSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const fixInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  errorText: z.string().max(50_000).default(''),
  cause: z.string().max(50_000).default(''),
  solution: z.string().max(200_000).default(''),
  /** Stack/area, e.g. "Hydrogen", "Vite", "Electron". */
  context: z.string().max(300).default(''),
  resolved: z.boolean().default(true),
  projectId: idSchema.nullable().default(null),
  ...withTagIds
})
export const fixPatchSchema = patchOf(fixInputSchema)
export type FixInput = z.input<typeof fixInputSchema>
export type FixPatch = z.input<typeof fixPatchSchema>

export const fixListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  resolved: z.boolean().optional(),
  ...favoriteFilter
})
export type FixListQuery = z.infer<typeof fixListQuerySchema>

export interface Fix extends EntityBase, WithTags {
  title: string
  errorText: string
  cause: string
  solution: string
  context: string
  resolved: boolean
  projectId: string | null
}
