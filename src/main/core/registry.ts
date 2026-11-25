import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { DRAFT_TITLES, type EntityType } from '@shared/entity-types'
import type { EntityRef, EntitySummary } from '@shared/domain/common'
import type { DbContext } from '../db/client'

/** Any table with the standard soft-delete columns. */
export type SoftTable = SQLiteTable & {
  id: SQLiteColumn
  createdAt: SQLiteColumn
  updatedAt: SQLiteColumn
  deletedAt: SQLiteColumn
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRow = Record<string, any> & {
  id: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/**
 * Describes how a module's table plugs into cross-cutting features.
 * Search, trash, pins, links, tags and export work with any registered descriptor (Open/Closed).
 */
export interface EntityDescriptor {
  type: EntityType
  table: SoftTable
  /** Text indexed by global search. */
  searchDoc(row: AnyRow): { title: string; body: string }
  /** Title/subtitle shown in pins, links, trash, search. */
  summary(row: AnyRow): { title: string; subtitle?: string }
  /** Entities that live and die with this one (cards of a board…). */
  dependents?(id: string): EntityRef[]
  /**
   * For dependents: the row is alive only while its parent is (a card of a board in the trash keeps
   * deletedAt = null, so it can't appear in the trash on its own). Applied everywhere through `live()`.
   */
  aliveWhere?: SQL
  /** Why a restore from the trash stays hidden by aliveWhere: what to restore first. */
  parentHint?: string
  /** Extra cleanup on permanent deletion (files on disk…). */
  onPurge?(row: AnyRow): void
  /** After a restore from the trash, inside its transaction (re-attach dependents, fix references). Throwing rolls the restore back. */
  onRestore?(row: AnyRow): void
  /** After «Скасувати» rolled the row back to a snapshot: undo side effects the edits had (mirrors, links). */
  afterRevert?(row: AnyRow, before: AnyRow): void
  /** File columns (relative path in <data>/files) and the columns that describe that file (size, colours…). */
  fileFields?: Record<string, string[]>
  /** Columns the app changes on its own (counters, SRS state, reminders): never reverted, not exported. */
  systemFields?: string[]
  /**
   * Child rows edited in the «Редагувати» mode together with the record (checklist items): part of its
   * snapshot, compared by «Зберегти зміни?» and rolled back by «Скасувати». `restore` runs inside the revert
   * transaction and must check the snapshot (it comes back from the renderer). `ignore` — child fields
   * changed outside the edit (ticks of a run): never a change, never rolled back.
   */
  children?: {
    snapshot(id: string): unknown
    restore(id: string, snap: unknown): void
    ignore?: string[]
  }
  /** Extra markdown appended to the record's file in the Markdown export (a board's columns and cards…). */
  exportBody?(row: AnyRow): string[]
  /**
   * Draft detection: the title column and the content columns that must all be empty.
   * Types without it never count as drafts.
   */
  draft?: {
    titleField: string
    contentFields: string[]
    /** Child rows (checklist items…) make the record non-empty even when its own columns are untouched. */
    hasChildren?: (id: string) => boolean
  }
}

/** Never edited since creation, default title, no content → an empty draft (see DRAFT_TITLES). */
export function isDraft(d: EntityDescriptor, row: AnyRow): boolean {
  if (!d.draft || row.deletedAt) return false
  const titles = DRAFT_TITLES[d.type]
  if (!titles?.includes(String(row[d.draft.titleField] ?? '').trim())) return false
  if (row.createdAt !== row.updatedAt) return false
  const empty = d.draft.contentFields.every((f) => {
    const v = row[f]
    return v === null || v === undefined || (typeof v === 'string' && !v.trim())
  })
  return empty && !d.draft.hasChildren?.(row.id)
}

export class EntityRegistry {
  private readonly map = new Map<EntityType, EntityDescriptor>()

  constructor(private readonly ctx: DbContext) {}

  register(descriptor: EntityDescriptor): void {
    this.map.set(descriptor.type, descriptor)
  }

  get(type: EntityType): EntityDescriptor {
    const d = this.map.get(type)
    if (!d) throw new Error(`Entity type not registered: ${type}`)
    return d
  }

  all(): EntityDescriptor[] {
    return [...this.map.values()]
  }

  /** Not in the trash and (for dependents) the parent isn't either. */
  live(d: EntityDescriptor): SQL {
    return d.aliveWhere ? and(isNull(d.table.deletedAt), d.aliveWhere)! : isNull(d.table.deletedAt)
  }

  findRow(ref: EntityRef, opts: { withDeleted?: boolean } = {}): AnyRow | undefined {
    const d = this.get(ref.type)
    const { table } = d
    const where = opts.withDeleted ? eq(table.id, ref.id) : and(eq(table.id, ref.id), this.live(d))
    return this.ctx.orm.select().from(table).where(where).get() as AnyRow | undefined
  }

  /** Which of the ids of a type are alive (`live(d)`): ids only, no row bodies. Unknown type → empty. */
  liveIds(type: EntityType, ids: string[]): Set<string> {
    const d = this.map.get(type)
    const alive = new Set<string>()
    if (!d) return alive
    // Chunks of 500: SQLite caps the number of bound variables in one statement.
    for (let i = 0; i < ids.length; i += 500) {
      const rows = this.ctx.orm
        .select({ id: d.table.id })
        .from(d.table)
        .where(and(inArray(d.table.id, ids.slice(i, i + 500)), this.live(d)))
        .all() as { id: string }[]
      for (const r of rows) alive.add(r.id)
    }
    return alive
  }

  /** Resolves many refs to summaries in one query per type; missing/deleted ones are dropped. */
  summarize(refs: EntityRef[], opts: { withDeleted?: boolean } = {}): EntitySummary[] {
    const byType = new Map<EntityType, string[]>()
    for (const r of refs) {
      const list = byType.get(r.type) ?? []
      list.push(r.id)
      byType.set(r.type, list)
    }
    const found = new Map<string, EntitySummary>()
    for (const [type, ids] of byType) {
      const d = this.map.get(type)
      if (!d) continue
      const where = opts.withDeleted
        ? inArray(d.table.id, ids)
        : and(inArray(d.table.id, ids), this.live(d))
      const rows = this.ctx.orm.select().from(d.table).where(where).all() as AnyRow[]
      for (const row of rows) {
        found.set(`${type}:${row.id}`, {
          type,
          id: row.id,
          ...d.summary(row),
          updatedAt: row.updatedAt,
          deletedAt: row.deletedAt
        })
      }
    }
    return refs.map((r) => found.get(`${r.type}:${r.id}`)).filter((s): s is EntitySummary => !!s)
  }
}
