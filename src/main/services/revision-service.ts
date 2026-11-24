import { eq } from 'drizzle-orm'
import type { EntityRef } from '@shared/domain/common'
import type { RecordSnapshot } from '@shared/api'
import type { DbContext } from '../db/client'
import type { AnyRow, EntityRegistry } from '../core/registry'
import { NotFoundError } from '../core/util'
import type { TagService } from './tag-service'
import type { SearchIndex } from './search-index'

/** Columns a revert may never touch. */
const FIXED = new Set(['id', 'createdAt', 'deletedAt'])

/**
 * «Скасувати» for the view/edit mode: a snapshot of a record (its row + tags) taken when editing starts,
 * and a revert back to it. Works for every registered entity (Open/Closed via EntityRegistry).
 * Only the record's own row and tags are restored; child rows (checklist items, cards…) are not.
 */
export class RevisionService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry,
    private readonly tags: TagService,
    private readonly search: SearchIndex
  ) {}

  snapshot(ref: EntityRef): RecordSnapshot {
    const row = this.registry.findRow(ref)
    if (!row) throw new NotFoundError(ref.type, ref.id)
    const tagIds = (this.tags.forMany(ref.type, [ref.id]).get(ref.id) ?? []).map((t) => t.id).sort()
    return { row: { ...row }, tagIds }
  }

  /** True when the record (own columns or tags) differs from the snapshot. */
  changed(ref: EntityRef, snap: RecordSnapshot): boolean {
    const now = this.snapshot(ref)
    if (now.tagIds.join() !== [...snap.tagIds].sort().join()) return true
    return Object.keys(now.row).some(
      (k) => k !== 'updatedAt' && JSON.stringify(now.row[k]) !== JSON.stringify(snap.row[k])
    )
  }

  revert(ref: EntityRef, snap: RecordSnapshot): void {
    const d = this.registry.get(ref.type)
    const current = this.registry.findRow(ref)
    if (!current) throw new NotFoundError(ref.type, ref.id)
    if (snap.row.id !== ref.id) throw new Error('Знімок належить іншому запису')
    // Only columns the row really has, with the same primitive type: the snapshot came from the renderer.
    const values: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(snap.row)) {
      if (FIXED.has(k) || !(k in current)) continue
      const cur = (current as AnyRow)[k]
      if (cur !== null && v !== null && typeof cur !== typeof v) continue
      values[k] = v
    }
    this.ctx.tx(() => {
      this.ctx.orm.update(d.table).set(values).where(eq(d.table.id, ref.id)).run()
      this.tags.setFor(ref.type, ref.id, snap.tagIds)
      const row = this.registry.findRow(ref)
      if (row) this.search.indexRow(ref.type, row)
    })
  }
}
