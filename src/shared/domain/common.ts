import { z } from 'zod'
import { ENTITY_TYPES, type EntityType } from '../entity-types'

export const idSchema = z.string().min(1).max(64)
export const entityTypeSchema = z.enum(ENTITY_TYPES)
/** Unix epoch milliseconds. */
export const timestampSchema = z.number().int().nonnegative()
export const urlSchema = z.string().trim().max(2048)
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable()

/** Fields every soft-deletable entity has. */
export interface EntityBase {
  id: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Tag {
  id: string
  name: string
  color: string | null
  createdAt: number
}

export interface TagWithUsage extends Tag {
  usage: number
}

export interface WithTags {
  tags: Tag[]
}

/** Tag ids may be sent together with any create/update payload. */
export const withTagIds = { tagIds: z.array(idSchema).max(50).optional() }

export const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  limit: z.number().int().min(1).max(5000).optional()
})
export type ListQuery = z.infer<typeof listQuerySchema>

export interface EntityRef {
  type: EntityType
  id: string
}

export const entityRefSchema = z.object({ type: entityTypeSchema, id: idSchema })

/** A lightweight, resolved pointer to any entity, used by links/pins/search/trash. */
export interface EntitySummary extends EntityRef {
  title: string
  subtitle?: string
  updatedAt?: number
  deletedAt?: number | null
}
