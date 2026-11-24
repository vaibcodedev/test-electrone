import { z } from 'zod'
import { idSchema, withTagIds, type EntityBase, type WithTags, patchOf } from './common'

/** A template is reusable ("Перед деплоем"); a run is a copy you tick through for a concrete release. */
export const CHECKLIST_KINDS = ['template', 'run'] as const
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number]

export const checklistInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(''),
  kind: z.enum(CHECKLIST_KINDS).default('template'),
  projectId: idSchema.nullable().default(null),
  ...withTagIds
})
export const checklistPatchSchema = patchOf(checklistInputSchema.omit({ kind: true }))
export type ChecklistInput = z.input<typeof checklistInputSchema>
export type ChecklistPatch = z.input<typeof checklistPatchSchema>

export interface Checklist extends EntityBase, WithTags {
  title: string
  description: string
  kind: ChecklistKind
  templateId: string | null
  projectId: string | null
  total: number
  done: number
}

export const checklistItemInputSchema = z.object({
  checklistId: idSchema,
  text: z.string().trim().min(1).max(1000),
  hint: z.string().max(5000).default(''),
  section: z.string().max(200).default('')
})
export const checklistItemPatchSchema = patchOf(
  checklistItemInputSchema.omit({ checklistId: true })
).extend({ done: z.boolean().optional() })
export type ChecklistItemInput = z.input<typeof checklistItemInputSchema>
export type ChecklistItemPatch = z.input<typeof checklistItemPatchSchema>

export interface ChecklistItem {
  id: string
  checklistId: string
  text: string
  hint: string
  section: string
  done: boolean
  position: number
}

export interface ChecklistDetails extends Checklist {
  items: ChecklistItem[]
}

export const instantiateSchema = z.object({
  templateId: idSchema,
  title: z.string().trim().min(1).max(200),
  projectId: idSchema.nullable().default(null)
})
export type InstantiateInput = z.input<typeof instantiateSchema>
