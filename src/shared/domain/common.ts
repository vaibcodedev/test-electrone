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

/** Optional paging for any list method (infinite scroll). Absent = everything. */
export const pageSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).max(10_000_000).optional()
})
export type PageQuery = z.infer<typeof pageSchema>

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

/**
 * Partial schema for updates WITHOUT defaults.
 * Zod 4 applies `.default()` even inside `.partial()`, so `schema.partial().parse({ title })` would
 * reset every other field to its default. Every *PatchSchema must be built with this helper.
 */
export function patchOf<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): ReturnType<z.ZodObject<T>['partial']> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const def = (field as unknown as { _zod: { def: { type: string; innerType?: z.ZodType } } })
        ._zod.def
      const inner = def.type === 'default' && def.innerType ? def.innerType : (field as z.ZodType)
      return [key, inner.optional()]
    })
  )
  return z.object(shape) as unknown as ReturnType<z.ZodObject<T>['partial']>
}
