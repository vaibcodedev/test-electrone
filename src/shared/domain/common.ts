import { z } from 'zod'
import { ENTITY_TYPES, type EntityType } from '../entity-types'

export const idSchema = z.string().min(1).max(64)
export const entityTypeSchema = z.enum(ENTITY_TYPES)
/** Unix epoch milliseconds. */
export const timestampSchema = z.number().int().nonnegative()
export const urlSchema = z.string().trim().max(2048)

/** Loose email check: something@domain.tld, no spaces. Empty counts as valid (the field is optional). */
export function isLikelyEmail(value: string): boolean {
  const v = value.trim()
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}
export const EMAIL_ERROR = 'Не схоже на email — наприклад, name@company.com'

/**
 * Loose phone check: digits with the usual separators (+, spaces, dashes, brackets, dots), 6–15 digits (E.164 has
 * at most 15). Empty counts as valid. «Telegram @name» belongs in «Месенджер».
 */
export function isLikelyPhone(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (!/^\+?[\d\s().-]+$/.test(v)) return false
  const digits = v.replace(/\D/g, '').length
  return digits >= 6 && digits <= 15
}
export const PHONE_ERROR = 'Не схоже на телефон — наприклад, +380 67 123 45 67'

/**
 * Client signals as a freelance platform shows them (proposal «Клієнт», CRM client «Платформа»); hire copies them
 * from the proposal to the client, so both use these.
 * Rating: Upwork's 1–5 with one decimal (4,9); empty = no reviews yet. An old 0 means the same and shows as empty.
 */
export const clientRatingSchema = z.number().min(1).max(5).multipleOf(0.1)
/** Hire rate: a whole percent, as the platform shows it. */
export const hireRateSchema = z.number().int().min(0).max(100)
/** Total spent on the platform: whole money units; the biggest Upwork clients are in the tens of millions. */
export const clientSpentSchema = z.number().int().min(0).max(100_000_000)
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

/** The «Обране» chip of a list: only records with ★ (spread into a section's list and counts schemas). */
export const favoriteFilter = { favorite: z.boolean().optional() }

/** Filters a list page shares with its chip counters (`counts` methods): the chips count what the search shows. */
export const chipCountsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  tagId: idSchema.optional(),
  ...favoriteFilter
})
export type ChipCountsQuery = z.infer<typeof chipCountsQuerySchema>


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
