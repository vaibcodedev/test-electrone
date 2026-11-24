import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { EntityType } from '@shared/entity-types'
import { patchOf, type EntitySummary, type Tag, type TagWithUsage } from '@shared/domain/common'
import { tagInputSchema, type TagInput } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { entityTags, tags } from '../db/schema'
import type { EntityRegistry } from '../core/registry'
import { newId, now, NotFoundError, UserError } from '../core/util'

/** Global tags shared by every module (polymorphic entity_tags). */
export class TagService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry
  ) {}

  private get db() {
    return this.ctx.orm
  }

  list(): TagWithUsage[] {
    return this.db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
        usage: sql<number>`(SELECT count(*) FROM ${entityTags} WHERE ${entityTags.tagId} = ${tags.id})`
      })
      .from(tags)
      .orderBy(asc(tags.name))
      .all()
  }

  create(input: TagInput): Tag {
    const data = tagInputSchema.parse(input)
    const existing = this.db
      .select()
      .from(tags)
      .where(sql`ulower(${tags.name}) = ulower(${data.name})`)
      .get()
    if (existing) return existing
    const tag: Tag = { id: newId(), name: data.name, color: data.color, createdAt: now() }
    this.db.insert(tags).values(tag).run()
    return tag
  }

  update(id: string, patch: Partial<TagInput>): Tag {
    const data = patchOf(tagInputSchema).parse(patch)
    if (data.name) {
      const clash = this.db
        .select()
        .from(tags)
        .where(sql`ulower(${tags.name}) = ulower(${data.name}) AND ${tags.id} != ${id}`)
        .get()
      if (clash) throw new UserError(`Мітка «${data.name}» уже існує`)
    }
    const updated = this.db.update(tags).set(data).where(eq(tags.id, id)).returning().get()
    if (!updated) throw new NotFoundError('Мітка', id)
    return updated
  }

  remove(id: string): void {
    this.db.delete(tags).where(eq(tags.id, id)).run()
  }

  /** Replaces the tag set of an entity. */
  setFor(type: EntityType, entityId: string, tagIds: string[]): void {
    const unique = [...new Set(tagIds)]
    this.ctx.tx(() => {
      this.db
        .delete(entityTags)
        .where(and(eq(entityTags.entityType, type), eq(entityTags.entityId, entityId)))
        .run()
      if (unique.length) {
        const valid = this.db.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique)).all()
        if (valid.length) {
          this.db
            .insert(entityTags)
            .values(valid.map((t) => ({ entityType: type, entityId, tagId: t.id })))
            .run()
        }
      }
    })
  }

  /** Tags for many entities of one type at once (avoids N+1). */
  forMany(type: EntityType, ids: string[]): Map<string, Tag[]> {
    const result = new Map<string, Tag[]>()
    if (!ids.length) return result
    const rows = this.db
      .select({ entityId: entityTags.entityId, tag: tags })
      .from(entityTags)
      .innerJoin(tags, eq(tags.id, entityTags.tagId))
      .where(and(eq(entityTags.entityType, type), inArray(entityTags.entityId, ids)))
      .orderBy(asc(tags.name))
      .all()
    for (const r of rows) {
      const list = result.get(r.entityId) ?? []
      list.push(r.tag)
      result.set(r.entityId, list)
    }
    return result
  }

  clearFor(type: EntityType, entityId: string): void {
    this.db
      .delete(entityTags)
      .where(and(eq(entityTags.entityType, type), eq(entityTags.entityId, entityId)))
      .run()
  }

  entities(tagId: string): EntitySummary[] {
    const refs = this.db
      .select({ type: entityTags.entityType, id: entityTags.entityId })
      .from(entityTags)
      .where(eq(entityTags.tagId, tagId))
      .all()
    return this.registry.summarize(refs as { type: EntityType; id: string }[])
  }
}
