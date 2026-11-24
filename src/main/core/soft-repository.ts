import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { EntityType } from '@shared/entity-types'
import type { Tag } from '@shared/domain/common'
import type { DbContext } from '../db/client'
import { entityTags } from '../db/schema'
import type { TagService } from '../services/tag-service'
import type { SearchIndex } from '../services/search-index'
import type { AnyRow, EntityDescriptor } from './registry'
import { defined, likePattern, newId, now, NotFoundError } from './util'

export interface RepositoryDeps {
  ctx: DbContext
  tags: TagService
  search: SearchIndex
}

/**
 * Generic repository for soft-deletable, taggable, searchable entities.
 * Modules extend it and only add what is specific to them (Liskov-safe: base behaviour is never broken).
 *
 * TRow   – raw row type ($inferSelect)
 * TEntity – domain type returned to the renderer
 */
export class SoftRepository<TRow extends AnyRow, TEntity extends { id: string }> {
  protected readonly type: EntityType

  constructor(
    protected readonly deps: RepositoryDeps,
    protected readonly descriptor: EntityDescriptor,
    private readonly mapRow: (row: TRow, tags: Tag[]) => TEntity
  ) {
    this.type = descriptor.type
  }

  protected get db() {
    return this.deps.ctx.orm
  }

  protected get table() {
    return this.descriptor.table
  }

  /* ───────── reads ───────── */

  row(id: string, withDeleted = false): TRow | undefined {
    const where = withDeleted
      ? eq(this.table.id, id)
      : and(eq(this.table.id, id), isNull(this.table.deletedAt))
    return this.db.select().from(this.table).where(where).get() as TRow | undefined
  }

  rowOrThrow(id: string): TRow {
    const row = this.row(id)
    if (!row) throw new NotFoundError(this.type, id)
    return row
  }

  get(id: string): TEntity | null {
    const row = this.row(id)
    return row ? this.hydrate([row])[0] : null
  }

  getOrThrow(id: string): TEntity {
    const entity = this.get(id)
    if (!entity) throw new NotFoundError(this.type, id)
    return entity
  }

  /** Attaches tags in one query. */
  hydrate(rows: TRow[]): TEntity[] {
    const tagMap = this.deps.tags.forMany(
      this.type,
      rows.map((r) => r.id)
    )
    return rows.map((r) => this.mapRow(r, tagMap.get(r.id) ?? []))
  }

  /** Lists non-deleted rows matching all conditions. */
  listWhere(conditions: (SQL | undefined)[], orderBy: SQL[] = [desc(this.table.updatedAt)], limit?: number): TEntity[] {
    let q = this.db
      .select()
      .from(this.table)
      .where(and(isNull(this.table.deletedAt), ...conditions))
      .orderBy(...orderBy)
      .$dynamic()
    if (limit) q = q.limit(limit)
    return this.hydrate(q.all() as TRow[])
  }

  /** Condition: entity has the tag. */
  hasTag(tagId: string | undefined): SQL | undefined {
    if (!tagId) return undefined
    return inArray(
      this.table.id,
      this.db
        .select({ id: entityTags.entityId })
        .from(entityTags)
        .where(and(eq(entityTags.entityType, this.type), eq(entityTags.tagId, tagId)))
    )
  }

  /** Condition: any of the columns contains the text (case-insensitive for ASCII + Cyrillic via lower()). */
  matches(text: string | undefined, columns: SQLiteColumn[]): SQL | undefined {
    const t = text?.trim()
    if (!t) return undefined
    const pattern = likePattern(t.toLowerCase())
    return or(...columns.map((c) => sql`lower(${c}) LIKE ${pattern} ESCAPE '\\'`))
  }

  /* ───────── writes ───────── */

  insert(values: Omit<TRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: string }, tagIds?: string[]): TEntity {
    const ts = now()
    const row = this.deps.ctx.tx(() => {
      const inserted = this.db
        .insert(this.table)
        .values({ ...values, id: values.id ?? newId(), createdAt: ts, updatedAt: ts, deletedAt: null })
        .returning()
        .get() as TRow
      if (tagIds) this.deps.tags.setFor(this.type, inserted.id, tagIds)
      this.deps.search.indexRow(this.type, inserted)
      return inserted
    })
    return this.hydrate([row])[0]
  }

  patch(id: string, values: Partial<TRow>, tagIds?: string[]): TEntity {
    const row = this.deps.ctx.tx(() => {
      const clean = defined({ ...values, id: undefined, createdAt: undefined, deletedAt: undefined })
      const updated = this.db
        .update(this.table)
        .set({ ...clean, updatedAt: now() })
        .where(and(eq(this.table.id, id), isNull(this.table.deletedAt)))
        .returning()
        .get() as TRow | undefined
      if (!updated) throw new NotFoundError(this.type, id)
      if (tagIds) this.deps.tags.setFor(this.type, id, tagIds)
      this.deps.search.indexRow(this.type, updated)
      return updated
    })
    return this.hydrate([row])[0]
  }

  /** Bumps updated_at (e.g. when children change) so "recent" lists stay truthful. */
  touch(id: string): void {
    this.db.update(this.table).set({ updatedAt: now() }).where(eq(this.table.id, id)).run()
  }

  /** Moves to trash. Dependents disappear from search until restored. */
  softDelete(id: string): void {
    this.deps.ctx.tx(() => {
      const res = this.db
        .update(this.table)
        .set({ deletedAt: now() })
        .where(and(eq(this.table.id, id), isNull(this.table.deletedAt)))
        .run()
      if (!res.changes) throw new NotFoundError(this.type, id)
      this.deps.search.remove(this.type, id)
      for (const dep of this.descriptor.dependents?.(id) ?? []) this.deps.search.remove(dep.type, dep.id)
    })
  }
}
