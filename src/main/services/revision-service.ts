import { existsSync } from 'fs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { entityRefSchema, type EntityRef } from '@shared/domain/common'
import type { RecordsApi, RecordSnapshot } from '@shared/api'
import type { DbContext } from '../db/client'
import type { AnyRow, EntityDescriptor, EntityRegistry } from '../core/registry'
import { now, NotFoundError, UserError } from '../core/util'
import type { TagService } from './tag-service'
import type { SearchIndex } from './search-index'
import type { FileStorage } from './file-storage'
import type { EventBus } from '../core/event-bus'

/** A snapshot comes back from the renderer: only its shape is trusted, values are checked in revert(). */
const snapshotArg = z.object({
  row: z.record(z.string(), z.unknown()),
  tagIds: z.array(z.string().max(40)).max(200),
  children: z.unknown().optional()
})

/** Columns a revert may never touch. */
const FIXED = new Set(['id', 'createdAt', 'deletedAt'])

/**
 * Bookkeeping the app changes on its own while you edit (updatedAt + each type's `systemFields`: copy
 * counter, reminders, SRS state…): not «your changes» — never a reason to ask «Зберегти зміни?», never rolled back.
 */
const isSystem = (d: EntityDescriptor, k: string): boolean =>
  k === 'updatedAt' || !!d.systemFields?.includes(k)

/** Child rows as text for a comparison, without the fields changed outside the edit (`children.ignore`). */
const childrenKey = (d: EntityDescriptor, children: unknown): string =>
  JSON.stringify(children ?? null, (k, v: unknown) =>
    d.children?.ignore?.includes(k) ? undefined : v
  )

/**
 * «Скасувати» for the view/edit mode: a snapshot of a record (its row + tags) taken when editing starts,
 * and a revert back to it. Works for every registered entity (Open/Closed via EntityRegistry).
 * Child rows are restored only for types that declare `children` (checklist items); cards of a board are not.
 */
export class RevisionService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry,
    private readonly tags: TagService,
    private readonly search: SearchIndex,
    private readonly files: FileStorage
  ) {}

  snapshot(ref: EntityRef): RecordSnapshot {
    const row = this.registry.findRow(ref)
    if (!row) throw new NotFoundError(ref.type, ref.id)
    const tagIds = (this.tags.forMany(ref.type, [ref.id]).get(ref.id) ?? []).map((t) => t.id).sort()
    const children = this.registry.get(ref.type).children?.snapshot(ref.id)
    return children === undefined
      ? { row: { ...row }, tagIds }
      : { row: { ...row }, tagIds, children }
  }

  /** True when the record (own columns, tags or child rows) differs from the snapshot. */
  changed(ref: EntityRef, snap: RecordSnapshot): boolean {
    const d = this.registry.get(ref.type)
    const now = this.snapshot(ref)
    if (now.tagIds.join() !== [...snap.tagIds].sort().join()) return true
    if (
      snap.children !== undefined &&
      childrenKey(d, now.children) !== childrenKey(d, snap.children)
    )
      return true
    // createdAt too: «+ Створити» may reuse this very draft and re-stamp it while it's open.
    return Object.keys(now.row).some(
      (k) =>
        !isSystem(d, k) &&
        !FIXED.has(k) &&
        JSON.stringify(now.row[k]) !== JSON.stringify(snap.row[k])
    )
  }

  /** A stored file still on disk (paths outside <data>/files count as missing). */
  private fileExists(path: unknown): boolean {
    if (typeof path !== 'string' || !path) return false
    try {
      return existsSync(this.files.resolve(path))
    } catch {
      return false
    }
  }

  revert(ref: EntityRef, snap: RecordSnapshot): void {
    const d = this.registry.get(ref.type)
    const current = this.registry.findRow(ref)
    if (!current) throw new NotFoundError(ref.type, ref.id)
    if (snap.row.id !== ref.id) throw new UserError('Знімок належить іншому запису')
    // Only columns the row really has, with the same primitive type: the snapshot came from the renderer.
    const values: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(snap.row)) {
      if (FIXED.has(k) || isSystem(d, k) || !(k in current)) continue
      const cur = (current as AnyRow)[k]
      if (cur !== null && v !== null && typeof cur !== typeof v) continue
      values[k] = v
    }
    // A replaced cover/image: its old file is deleted at once (setCover, replaceImage). Rolling the path back
    // to a missing file would break the picture, so then the new one stays; otherwise the new file goes.
    const orphans: string[] = []
    for (const [col, companions] of Object.entries(d.fileFields ?? {})) {
      if (!(col in values) || values[col] === current[col]) continue
      if (values[col] !== null && !this.fileExists(values[col])) {
        for (const k of [col, ...companions]) delete values[k]
      } else if (typeof current[col] === 'string') {
        orphans.push(current[col])
      }
    }
    // A record untouched at snapshot time stays a draft after the revert (createdAt === updatedAt), even if
    // draft reuse re-stamped createdAt meanwhile; otherwise updatedAt never goes below createdAt.
    const snapAt = Number(snap.row.updatedAt)
    const createdAt = Number((current as AnyRow).createdAt)
    values.updatedAt =
      snapAt === Number(snap.row.createdAt) ? createdAt : Math.max(snapAt, createdAt)
    // Files go only after the commit (FileStorage.afterCommit): a failed revert keeps the picture.
    this.files.afterCommit(() =>
      this.ctx.tx(() => {
        this.ctx.orm.update(d.table).set(values).where(eq(d.table.id, ref.id)).run()
        this.tags.setFor(ref.type, ref.id, snap.tagIds)
        if (snap.children !== undefined) d.children?.restore(ref.id, snap.children)
        const reverted = this.registry.findRow(ref)
        if (reverted) {
          this.search.indexRow(ref.type, reverted)
          d.afterRevert?.(reverted, current)
        }
        for (const p of orphans) this.files.remove(p)
      })
    )
  }

  /**
   * «Зберегти» on a record created a moment ago: the person chose to keep it, even under the default title and
   * with nothing in it. An empty draft is «never edited» (createdAt === updatedAt, see isDraft), so bumping
   * updatedAt ends that: leaving the page (discardDraft) and the next «+ Створити» (draft reuse in
   * SoftRepository.insert) no longer take the saved record away. Records already edited are left alone.
   */
  keep(ref: EntityRef): boolean {
    const d = this.registry.get(ref.type)
    const row = this.registry.findRow(ref)
    if (!row || row.deletedAt || Number(row.updatedAt) !== Number(row.createdAt)) return false
    this.ctx.orm
      .update(d.table)
      .set({ updatedAt: Math.max(now(), Number(row.createdAt) + 1) })
      .where(eq(d.table.id, ref.id))
      .run()
    return true
  }

  api(bus: EventBus): RecordsApi {
    return {
      keep: async (ref) => {
        const r = entityRefSchema.parse(ref)
        if (this.keep(r)) bus.dataChanged([r.type])
      },
      snapshot: async (ref) => this.snapshot(entityRefSchema.parse(ref)),
      changed: async (args) =>
        this.changed(entityRefSchema.parse(args.ref), snapshotArg.parse(args.snapshot)),
      revert: async (args) => {
        const ref = entityRefSchema.parse(args.ref)
        this.revert(ref, snapshotArg.parse(args.snapshot))
        bus.dataChanged([ref.type])
      }
    }
  }
}
