import { and, eq, or } from 'drizzle-orm'
import type { EntityRef } from '@shared/domain/common'
import type { Orm } from '../db/client'
import { attachments, entityLinks, entityTags, pins } from '../db/schema'

/**
 * True when a record has anything attached to it besides its own columns: files, links, tags or pins.
 * Such a record is never treated as an empty draft (attaching a file doesn't bump updated_at).
 */
export function hasTraces(orm: Orm, ref: EntityRef): boolean {
  const file = orm
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.entityType, ref.type), eq(attachments.entityId, ref.id)))
    .get()
  if (file) return true
  const tag = orm
    .select({ t: entityTags.tagId })
    .from(entityTags)
    .where(and(eq(entityTags.entityType, ref.type), eq(entityTags.entityId, ref.id)))
    .get()
  if (tag) return true
  const pin = orm
    .select({ k: pins.kind })
    .from(pins)
    .where(and(eq(pins.entityType, ref.type), eq(pins.entityId, ref.id)))
    .get()
  if (pin) return true
  const link = orm
    .select({ f: entityLinks.fromId })
    .from(entityLinks)
    .where(
      or(
        and(eq(entityLinks.fromType, ref.type), eq(entityLinks.fromId, ref.id)),
        and(eq(entityLinks.toType, ref.type), eq(entityLinks.toId, ref.id))
      )
    )
    .get()
  return !!link
}
