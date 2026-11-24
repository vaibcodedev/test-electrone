import { z } from 'zod'
import { idSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

/** General notes (everything that is not Claude-specific). `folder` is an optional free-text group. */
export const noteInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(500_000).default(''),
  folder: z.string().trim().max(100).default(''),
  ...withTagIds
})
export const notePatchSchema = patchOf(noteInputSchema)
export type NoteInput = z.input<typeof noteInputSchema>
export type NotePatch = z.input<typeof notePatchSchema>

export const noteListQuerySchema = z.object({
  folder: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional()
})
export type NoteListQuery = z.infer<typeof noteListQuerySchema>

export interface Note extends EntityBase, WithTags {
  title: string
  body: string
  folder: string
}
