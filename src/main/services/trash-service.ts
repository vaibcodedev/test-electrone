import { and, eq, isNotNull, isNull, lt, desc, count as sqlCount } from 'drizzle-orm'
import type { TrashApi } from '@shared/api'
import { entityRefSchema, pageSchema, type EntityRef } from '@shared/domain/common'
import type { TrashItem } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { hasTraces } from '../core/traces'
import { isDraft, type AnyRow, type EntityRegistry, type EntityDescriptor } from '../core/registry'
import { DAY_MS, now, NotFoundError, UserError } from '../core/util'
import type { TagService } from './tag-service'
import type { LinkService } from './link-service'
import type { PinService } from './pin-service'
import type { AttachmentService } from './attachment-service'
import type { SearchIndex } from './search-index'
import type { FileStorage } from './file-storage'
import type { EventBus } from '../core/event-bus'

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
      files: FileStorage
    }
  ) {}

  /** Number of items in the trash (header «Очистити кошик» count without loading every page). */
  count(): number {
    let n = 0
    for (const d of this.registry.all()) {
      n += this.ctx.orm.select({ n: sqlCount() }).from(d.table).where(isNotNull(d.table.deletedAt)).get()?.n ?? 0
    }
    return n
  }

  /**
   * Paged across all entity tables, newest deletion first. Each table contributes at most offset+limit
   * (id, deletedAt) pairs via SQL; full rows are loaded only for the requested page.
   */
  page(limit?: number, offset = 0): TrashItem[] {
    if (!limit) return this.list().slice(offset)
    const want = offset + limit
    const keys: { d: EntityDescriptor; id: string; deletedAt: number }[] = []
    for (const d of this.registry.all()) {
      const rows = this.ctx.orm
        .select({ id: d.table.id, deletedAt: d.table.deletedAt })
        .from(d.table)
        .where(isNotNull(d.table.deletedAt))
        .orderBy(desc(d.table.deletedAt))
        .limit(want)
        .all() as { id: string; deletedAt: number }[]
      for (const r of rows) keys.push({ d, id: r.id, deletedAt: r.deletedAt })
    }
    keys.sort((a, b) => b.deletedAt - a.deletedAt)
    const items: TrashItem[] = []
    for (const k of keys.slice(offset, want)) {
      const row = this.registry.findRow({ type: k.d.type, id: k.id }, { withDeleted: true })
      if (!row) continue
      items.push({
        type: k.d.type,
        id: row.id,
        ...k.d.summary(row),
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt!,
        purgeAt: row.deletedAt! + TRASH_TTL_MS
      })
    }
    return items
  }

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
    const row = this.ctx.tx(() => {
      const restored = this.ctx.orm
        .update(d.table)
        .set({ deletedAt: null, updatedAt: now() })
        .where(and(eq(d.table.id, ref.id), isNotNull(d.table.deletedAt)))
        .returning()
        .get() as AnyRow | undefined
      if (!restored) throw new NotFoundError(ref.type, ref.id)
      // A card whose board is still in the trash would vanish (hidden by aliveWhere) while the UI says «restored».
      if (d.aliveWhere && !this.registry.findRow(ref))
        throw new UserError(d.parentHint ?? 'Спершу відновіть запис, до якого це належить')
      if (!d.onRestore) return restored
      // The hook may change the row itself (a card moved to another column): index what it left.
      d.onRestore(restored)
      return this.registry.findRow(ref) ?? restored
    })
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
    // Files are deleted only after the DB transaction commits (FileStorage.afterCommit).
    this.cleaners.files.afterCommit(() =>
      this.ctx.tx(() => {
        for (const dep of dependents) this.clearTraces(dep)
        this.clearTraces(ref)
        d.onPurge?.(row)
        this.ctx.orm.delete(d.table).where(eq(d.table.id, ref.id)).run()
      })
    )
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

  /**
   * Closing an empty draft (default title, never edited, no content) deletes it for good — no trash entry.
   * The renderer calls this a moment after the editor closes; the check runs here, so a late autosave wins.
   */
  discardDraft(ref: EntityRef): boolean {
    const d = this.registry.get(ref.type)
    const row = this.registry.findRow(ref)
    if (!row || !isDraft(d, row) || hasTraces(this.ctx.orm, ref)) return false
    this.purge(ref)
    return true
  }

  /**
   * «Скасувати» on a record created a moment ago: it is removed for good with everything attached to it,
   * whatever was typed — the user said «don't create it». Guarded to records from the last day, so a
   * stale or wrong call can't wipe old data.
   */
  discardNew(ref: EntityRef): boolean {
    const row = this.registry.findRow(ref)
    if (!row || now() - row.createdAt > DAY_MS) return false
    this.purge(ref)
    return true
  }

  /** Startup: drafts left over from earlier sessions (app closed with a draft open) older than an hour. */
  purgeStaleDrafts(): number {
    const cutoff = now() - 3600_000
    let count = 0
    for (const d of this.registry.all()) {
      if (!d.draft) continue
      const rows = this.ctx.orm
        .select()
        .from(d.table)
        .where(and(isNull(d.table.deletedAt), eq(d.table.createdAt, d.table.updatedAt), lt(d.table.createdAt, cutoff)))
        .all() as AnyRow[]
      for (const r of rows) {
        if (!isDraft(d, r) || hasTraces(this.ctx.orm, { type: d.type, id: r.id })) continue
        this.purge({ type: d.type, id: r.id })
        count++
      }
    }
    return count
  }

  /** Called on startup and every 6 hours: removes everything older than 30 days. */
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

  api(bus: EventBus): TrashApi {
    return {
      list: async (args) => {
        const p = pageSchema.parse(args ?? {})
        return this.page(p.limit, p.offset)
      },
      count: async () => this.count(),
      restore: async (ref) => {
        this.restore(entityRefSchema.parse(ref))
        bus.dataChanged('all')
      },
      // The list may be stale (restored in another window meanwhile): «Видалити назавжди» never hits a live record.
      purge: async (ref) => {
        const r = entityRefSchema.parse(ref)
        const row = this.registry.findRow(r, { withDeleted: true })
        if (row && row.deletedAt == null) throw new UserError('Запис уже не в кошику — оновіть список')
        this.purge(r)
      },
      empty: async () => this.empty(),
      discardDraft: async (ref) => this.discardDraft(entityRefSchema.parse(ref)),
      discardNew: async (ref) => this.discardNew(entityRefSchema.parse(ref))
    }
  }
}
