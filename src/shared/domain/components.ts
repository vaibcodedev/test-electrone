import { z } from 'zod'
import { MAX } from './limits'
import { idSchema, urlSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

export const COMPONENT_LANGUAGES = ['tsx', 'jsx', 'html'] as const
export type ComponentLanguage = (typeof COMPONENT_LANGUAGES)[number]
export const PREVIEW_BACKGROUNDS = ['light', 'dark', 'grid'] as const
export type PreviewBackground = (typeof PREVIEW_BACKGROUNDS)[number]

export const componentInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(20_000).default(''),
  code: z.string().max(500_000).default(''),
  language: z.enum(COMPONENT_LANGUAGES).default('tsx'),
  sourceUrl: urlSchema.default(''),
  previewBg: z.enum(PREVIEW_BACKGROUNDS).default('light'),
  ...withTagIds
})
export const componentPatchSchema = patchOf(componentInputSchema)
export type ComponentInput = z.input<typeof componentInputSchema>
export type ComponentPatch = z.input<typeof componentPatchSchema>

export const componentListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  tagId: idSchema.optional()
})
export type ComponentListQuery = z.infer<typeof componentListQuerySchema>

export interface UiComponent extends EntityBase, WithTags {
  title: string
  description: string
  code: string
  language: ComponentLanguage
  sourceUrl: string
  previewBg: PreviewBackground
  /** Relative path (inside the files folder) of the screenshot/gif, if any. */
  coverPath: string | null
}
