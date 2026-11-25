import { z } from 'zod'
import { MAX } from './limits'
import {
  hexColorSchema,
  favoriteFilter, idSchema,
  urlSchema,
  withTagIds,
  type EntityBase,
  type WithTags,
  pageSchema,
  patchOf
} from './common'

export const DESIGN_KINDS = ['site', 'landing', 'shop', 'app', 'dashboard', 'other'] as const
export type DesignKind = (typeof DESIGN_KINDS)[number]

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const designInputSchema = z.object({
  title: z.string().trim().max(MAX.title).default(''),
  kind: z.enum(DESIGN_KINDS).default('site'),
  sourceUrl: urlSchema.default(''),
  notes: z.string().max(20_000).default(''),
  colors: z.array(hex).max(12).default([]),
  ...withTagIds
})
export const designPatchSchema = patchOf(designInputSchema)
/** Palette found in the image later (background fill-in): `designs.setColors`. */
export const designColorsSchema = z.object({ id: idSchema, colors: designInputSchema.shape.colors })
export type DesignInput = z.input<typeof designInputSchema>
export type DesignPatch = z.input<typeof designPatchSchema>

export const designListQuerySchema = z.object({
  kind: z.enum(DESIGN_KINDS).optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  color: hex.optional(),
  moodboardId: idSchema.optional(),
  ...favoriteFilter
})
export type DesignListQuery = z.infer<typeof designListQuerySchema>
/** `designs.counts`: the list filters except the kind itself — counts for the kind chips. */
export const designCountsQuerySchema = designListQuerySchema.omit({ kind: true })
export type DesignCountsQuery = z.infer<typeof designCountsQuerySchema>

export interface Design extends EntityBase, WithTags {
  title: string
  kind: DesignKind
  sourceUrl: string
  notes: string
  colors: string[]
  /** Relative path inside the files folder. */
  imagePath: string | null
  imageWidth: number | null
  imageHeight: number | null
}

/** A new file coming from drag&drop (absolute path), raw bytes, or the system clipboard. */
export const fileSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string().min(1).max(4096) }),
  z.object({
    kind: z.literal('bytes'),
    name: z.string().max(255),
    mime: z.string().max(100),
    data: z.instanceof(Uint8Array)
  }),
  z.object({ kind: z.literal('clipboard') })
])
export type FileSource = z.infer<typeof fileSourceSchema>

export const moodboardInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(5000).default(''),
  color: hexColorSchema.default(null),
  ...withTagIds
})
export const moodboardPatchSchema = patchOf(moodboardInputSchema)
export type MoodboardInput = z.input<typeof moodboardInputSchema>
export type MoodboardPatch = z.input<typeof moodboardPatchSchema>
/**
 * `moodboards.list`: favourites first, then boards with designs, then empty ones (each by last change).
 * `designId` adds `contains`; `search` looks in the title and description.
 */
export const moodboardListQuerySchema = pageSchema.extend({
  designId: idSchema.optional(),
  search: z.string().max(200).optional()
})
export type MoodboardListQuery = z.infer<typeof moodboardListQuerySchema>

export interface Moodboard extends EntityBase, WithTags {
  title: string
  description: string
  color: string | null
  itemCount: number
  /** First few image paths for the cover mosaic. */
  previewPaths: string[]
  /** In «Обране» (pins kind 'favorite'): the star on the tile and first place in the row. */
  favorite: boolean
  /** Only when listed for a design (`moodboards.list({ designId })`): that design is in this moodboard. */
  contains?: boolean
}

export interface MoodboardDetails extends Moodboard {
  designs: Design[]
}
