import { eq } from 'drizzle-orm'
import type { RecordSnapshot } from '@shared/api'
import type { EntityRef } from '@shared/domain/common'
import { PALETTE } from '@shared/colors'
import type { DbContext } from '../../db/client'
import type { EntityRegistry } from '../../core/registry'
import { NotFoundError, now, UserError } from '../../core/util'
import type { SearchIndex } from '../search-index'
import type { TagService } from '../tag-service'
import type { RevisionService } from '../revision-service'
import type { TrashService } from '../trash-service'

/** What applying a chat action may do to an existing record, and how to take it back. */
export interface AiRecordWriter {
  /** Title of a live record; null when it's gone or in the trash. */
  title(ref: EntityRef): string | null
  /** The type has a main text («Додати текст» works on it). */
  canAppend(ref: EntityRef): boolean
  appendText(ref: EntityRef, text: string): void
  /** Adds tags by name (existing ones matched case-insensitively, new ones created); keeps the record's own. */
  addTags(ref: EntityRef, names: string[]): void
  snapshot(ref: EntityRef): RecordSnapshot
  revert(ref: EntityRef, snap: RecordSnapshot): void
  /** A record created a moment ago: deleted for good (the «Скасувати» of «Створено»). */
  discardNew(ref: EntityRef): boolean
  /** A new record under a default title stays (never treated as an empty draft). */
  keep(ref: EntityRef): void
}

/**
 * Edits through the EntityRegistry, the way «Скасувати» of the edit mode writes (RevisionService): the
 * descriptor names the text column (`textField`) and its limit, the search index follows (the chat service
 * tells every window).
 * Rolling back is RevisionService's snapshot, deleting a new record is the trash's `discardNew`.
 */
export class RegistryRecordWriter implements AiRecordWriter {
  constructor(
    private readonly deps: {
      ctx: DbContext
      registry: EntityRegistry
      tags: TagService
      search: SearchIndex
      revisions: RevisionService
      trash: TrashService
    }
  ) {}

  title(ref: EntityRef): string | null {
    return this.deps.registry.summarize([ref])[0]?.title ?? null
  }

  canAppend(ref: EntityRef): boolean {
    return !!this.deps.registry.get(ref.type).textField
  }

  appendText(ref: EntityRef, text: string): void {
    const { registry, ctx, search } = this.deps
    const d = registry.get(ref.type)
    const field = d.textField
    if (!field) throw new UserError('До цього запису не можна додати текст')
    ctx.tx(() => {
      const row = registry.findRow(ref)
      if (!row) throw new NotFoundError(ref.type, ref.id)
      const current = String(row[field.column] ?? '').trimEnd()
      const next = current ? `${current}\n\n${text.trim()}` : text.trim()
      if (next.length > field.max)
        throw new UserError(
          'Текст не вміститься в запис — він задовгий. Скоротіть його й спробуйте ще раз'
        )
      ctx.orm
        .update(d.table)
        .set({ [field.column]: next, updatedAt: Math.max(now(), Number(row.updatedAt) + 1) })
        .where(eq(d.table.id, ref.id))
        .run()
      const updated = registry.findRow(ref)
      if (updated) search.indexRow(ref.type, updated)
    })
  }

  addTags(ref: EntityRef, names: string[]): void {
    const { registry, ctx, tags } = this.deps
    const d = registry.get(ref.type)
    ctx.tx(() => {
      const row = registry.findRow(ref)
      if (!row) throw new NotFoundError(ref.type, ref.id)
      const count = tags.list().length
      const own = (tags.forMany(ref.type, [ref.id]).get(ref.id) ?? []).map((t) => t.id)
      // create() returns an existing tag of the same name (any case), so «React» never doubles as «react».
      const added = names.map(
        (name, i) => tags.create({ name, color: PALETTE[(count + i) % PALETTE.length] }).id
      )
      tags.setFor(ref.type, ref.id, [...own, ...added])
      ctx.orm
        .update(d.table)
        .set({ updatedAt: Math.max(now(), Number(row.updatedAt) + 1) })
        .where(eq(d.table.id, ref.id))
        .run()
    })
  }

  snapshot(ref: EntityRef): RecordSnapshot {
    return this.deps.revisions.snapshot(ref)
  }

  revert(ref: EntityRef, snap: RecordSnapshot): void {
    this.deps.revisions.revert(ref, snap)
  }

  discardNew(ref: EntityRef): boolean {
    return this.deps.trash.discardNew(ref)
  }

  keep(ref: EntityRef): void {
    this.deps.revisions.keep(ref)
  }
}
