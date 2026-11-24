import { and, eq, isNotNull, lt } from 'drizzle-orm'
import type { EntityRef } from '@shared/domain/common'
import type { TrashItem } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import type { AnyRow, EntityRegistry } from '../core/registry'
import { DAY_MS, now, NotFoundError } from '../core/util'
import type { TagService } from './tag-service'
import type { LinkService } from './link-service'
import type { PinService } from './pin-service'
import type { AttachmentService } from './attachment-service'
import type { SearchIndex } from './search-index'

export const TRASH_TTL_MS = 30 * DAY_MS

/** Trash: lists soft-deleted entities, restores them, and purges them permanently (with all their traces). */
export class TrashService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry,
    private readonly cleaners: {
      tags: TagService
      links: LinkService
      pins: PinService
      attachments: AttachmentService
      search: SearchIndex
    }
  ) {}

  list(): TrashItem[] {
    const items: TrashItem[] = []
    for (const d of this.registry.all()) {
      const rows = this.ctx.orm.select().from(d.table).where(isNotNull(d.table.deletedAt)).all() as AnyRow[]
      for (const row of rows) {
        items.push({
          type: d.type,
          id: row.id,
          ...d.summary(row),
          updatedAt: row.updatedAt,
          deletedAt: row.deletedAt!,
          purgeAt: row.deletedAt! + TRASH_TTL_MS
        })
      }
    }
    return items.sort((a, b) => b.deletedAt - a.deletedAt)
  }

  restore(ref: EntityRef): void {
    const d = this.registry.get(ref.type)
    const row = this.ctx.orm
      .update(d.table)
      .set({ deletedAt: null, updatedAt: now() })
      .where(and(eq(d.table.id, ref.id), isNotNull(d.table.deletedAt)))
      .returning()
      .get() as AnyRow | undefined
    if (!row) throw new NotFoundError(ref.type, ref.id)
    this.cleaners.search.indexRow(ref.type, row)
    for (const dep of d.dependents?.(ref.id) ?? []) {
      const depRow = this.registry.findRow(dep)
      if (depRow) this.cleaners.search.indexRow(dep.type, depRow)
    }
  }

  /** Permanently deletes an entity, its dependents and every polymorphic trace (tags, links, pins, files, index). */
  purge(ref: EntityRef): void {
    const d = this.registry.get(ref.type)
    const row = this.registry.findRow(ref, { withDeleted: true })
    if (!row) return
    const dependents = d.dependents?.(ref.id) ?? []
    this.ctx.tx(() => {
      for (const dep of dependents) this.clearTraces(dep)
      this.clearTraces(ref)
      d.onPurge?.(row)
      this.ctx.orm.delete(d.table).where(eq(d.table.id, ref.id)).run()
    })
  }

  private clearTraces(ref: EntityRef): void {
    this.cleaners.tags.clearFor(ref.type, ref.id)
    this.cleaners.links.clearFor(ref)
    this.cleaners.pins.clearFor(ref)
    this.cleaners.attachments.clearFor(ref)
    this.cleaners.search.remove(ref.type, ref.id)
  }

  empty(): number {
    const items = this.list()
    for (const item of items) this.purge(item)
    return items.length
  }

  /** Called on startup and daily: removes everything older than 30 days. */
  purgeExpired(): number {
    const cutoff = now() - TRASH_TTL_MS
    let count = 0
    for (const d of this.registry.all()) {
      const rows = this.ctx.orm
        .select({ id: d.table.id })
        .from(d.table)
        .where(and(isNotNull(d.table.deletedAt), lt(d.table.deletedAt, cutoff)))
        .all() as { id: string }[]
      for (const r of rows) {
        this.purge({ type: d.type, id: r.id })
        count++
      }
    }
    return count
  }
}
