import { and, eq, inArray, isNull } from 'drizzle-orm'
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
  /** Extra cleanup on permanent deletion (files on disk…). */
  onPurge?(row: AnyRow): void
  /**
   * Draft detection: the title column and the content columns that must all be empty.
   * Types without it never count as drafts.
   */
  draft?: { titleField: string; contentFields: string[] }
}

/** Never edited since creation, default title, no content → an empty draft (see DRAFT_TITLES). */
export function isDraft(d: EntityDescriptor, row: AnyRow): boolean {
  if (!d.draft || row.deletedAt) return false
  const titles = DRAFT_TITLES[d.type]
  if (!titles?.includes(String(row[d.draft.titleField] ?? '').trim())) return false
  if (row.createdAt !== row.updatedAt) return false
  return d.draft.contentFields.every((f) => {
    const v = row[f]
    return v === null || v === undefined || (typeof v === 'string' && !v.trim())
  })
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

  findRow(ref: EntityRef, opts: { withDeleted?: boolean } = {}): AnyRow | undefined {
    const { table } = this.get(ref.type)
    const where = opts.withDeleted
      ? eq(table.id, ref.id)
      : and(eq(table.id, ref.id), isNull(table.deletedAt))
    return this.ctx.orm.select().from(table).where(where).get() as AnyRow | undefined
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
        : and(inArray(d.table.id, ids), isNull(d.table.deletedAt))
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
