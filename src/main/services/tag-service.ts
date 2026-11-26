import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { TagsApi } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import {
  entityRefSchema,
  idSchema,
  pageSchema,
  patchOf,
  type EntityRef,
  type EntitySummary,
  type Tag,
  type TagWithUsage
} from '@shared/domain/common'
import { tagInputSchema, type TagInput } from '@shared/domain/system'
import type { DbContext, Orm } from '../db/client'
import { entityTags, tags } from '../db/schema'
import type { EntityRegistry } from '../core/registry'
import { newId, now, NotFoundError, UserError } from '../core/util'

/** Global tags shared by every module (polymorphic entity_tags). */
export class TagService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry
  ) {}

  private get db(): Orm {
    return this.ctx.orm
  }

  /**
   * Usage counts only live records (not the trash, not cards of a deleted board): the number on a tag
   * matches the list it opens. One grouped query per entity type, no N+1.
   */
  list(): TagWithUsage[] {
    const usage = new Map<string, number>()
    for (const d of this.registry.all()) {
      const rows = this.db
        .select({ tagId: entityTags.tagId, n: sql<number>`count(*)` })
        .from(entityTags)
        .innerJoin(d.table, eq(d.table.id, entityTags.entityId))
        .where(and(eq(entityTags.entityType, d.type), this.registry.live(d)))
        .groupBy(entityTags.tagId)
        .all()
      for (const r of rows) usage.set(r.tagId, (usage.get(r.tagId) ?? 0) + r.n)
    }
    return this.db
      .select()
      .from(tags)
      .orderBy(asc(tags.name))
      .all()
      .map((t) => ({ ...t, usage: usage.get(t.id) ?? 0 }))
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
        const valid = this.db
          .select({ id: tags.id })
          .from(tags)
          .where(inArray(tags.id, unique))
          .all()
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

  /**
   * Takes one tag off one record (`on: false`, «Зняти мітку» on the tag's page) or puts it back (`on: true`, the
   * toast's «Скасувати»). Only a live record; its other tags stay. The record counts as changed (updatedAt).
   */
  setOn(tagId: string, ref: EntityRef, on: boolean): void {
    const d = this.registry.get(ref.type)
    if (!this.registry.findRow(ref)) throw new NotFoundError(ref.type, ref.id)
    if (!this.db.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).get())
      throw new NotFoundError('Мітка', tagId)
    this.ctx.tx(() => {
      const where = and(
        eq(entityTags.entityType, ref.type),
        eq(entityTags.entityId, ref.id),
        eq(entityTags.tagId, tagId)
      )
      const has = !!this.db.select({ id: entityTags.tagId }).from(entityTags).where(where).get()
      if (has === on) return
      if (on) this.db.insert(entityTags).values({ entityType: ref.type, entityId: ref.id, tagId }).run()
      else this.db.delete(entityTags).where(where).run()
      this.db.update(d.table).set({ updatedAt: now() }).where(eq(d.table.id, ref.id)).run()
    })
  }

  clearFor(type: EntityType, entityId: string): void {
    this.db
      .delete(entityTags)
      .where(and(eq(entityTags.entityType, type), eq(entityTags.entityId, entityId)))
      .run()
  }

  /**
   * Live records carrying the tag, recently changed first (ties by type and id, so pages never overlap).
   * Ordered and paged over light (id, updatedAt) rows; only the page itself is summarized.
   */
  entities(tagId: string, page: { limit?: number; offset?: number } = {}): EntitySummary[] {
    const refs: { type: EntityType; id: string; updatedAt: number }[] = []
    for (const d of this.registry.all()) {
      const rows = this.db
        .select({ id: d.table.id, updatedAt: d.table.updatedAt })
        .from(d.table)
        .innerJoin(
          entityTags,
          and(eq(entityTags.entityId, d.table.id), eq(entityTags.entityType, d.type))
        )
        .where(and(eq(entityTags.tagId, tagId), this.registry.live(d)))
        .all() as { id: string; updatedAt: number }[]
      for (const r of rows) refs.push({ type: d.type, id: r.id, updatedAt: r.updatedAt })
    }
    refs.sort(
      (a, b) =>
        b.updatedAt - a.updatedAt ||
        (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    const offset = page.offset ?? 0
    const slice = refs.slice(offset, page.limit ? offset + page.limit : undefined)
    return this.registry.summarize(slice.map(({ type, id }) => ({ type, id })))
  }

  api(): TagsApi {
    return {
      list: async () => this.list(),
      create: async (input) => this.create(input),
      update: async (args) => {
        const { id, patch } = z
          .object({ id: idSchema, patch: z.record(z.string(), z.unknown()) })
          .parse(args)
        return this.update(id, patch)
      },
      remove: async (id) => this.remove(idSchema.parse(id)),
      setOn: async (args) => {
        const { tagId, ref, on } = z
          .object({ tagId: idSchema, ref: entityRefSchema, on: z.boolean() })
          .parse(args)
        this.setOn(tagId, ref, on)
      },
      entities: async (args) => {
        const { tagId, ...page } =
          typeof args === 'string'
            ? { tagId: idSchema.parse(args) }
            : pageSchema.extend({ tagId: idSchema }).parse(args)
        return this.entities(tagId, page)
      }
    }
  }
}
