import type { EntityType } from '@shared/entity-types'
import type { SearchHit, SearchQuery } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import type { AnyRow, EntityRegistry } from '../core/registry'
import { toFtsQuery } from '../core/util'

const MAX_BODY = 20_000

/** Wrapper over the FTS5 `search_index` table. Single responsibility: keep the index in sync and query it. */
export class SearchIndex {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry
  ) {}

  upsert(type: EntityType, id: string, doc: { title: string; body: string }): void {
    const db = this.ctx.sqlite
    db.prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?').run(type, id)
    db.prepare('INSERT INTO search_index (entity_type, entity_id, title, body) VALUES (?, ?, ?, ?)').run(
      type,
      id,
      doc.title,
      doc.body.slice(0, MAX_BODY)
    )
  }

  indexRow(type: EntityType, row: AnyRow): void {
    if (row.deletedAt) return this.remove(type, row.id)
    this.upsert(type, row.id, this.registry.get(type).searchDoc(row))
  }

  remove(type: EntityType, id: string): void {
    this.ctx.sqlite
      .prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?')
      .run(type, id)
  }

  query(q: SearchQuery): SearchHit[] {
    const match = toFtsQuery(q.text)
    if (!match) return []
    const limit = q.limit ?? 40
    const typeFilter = q.types?.length
      ? `AND entity_type IN (${q.types.map(() => '?').join(',')})`
      : ''
    const rows = this.ctx.sqlite
      .prepare(
        `SELECT entity_type AS type, entity_id AS id, title,
                snippet(search_index, 3, char(1), char(2), '…', 14) AS snippet,
                bm25(search_index, 0, 0, 8.0, 1.0) AS rank
           FROM search_index
          WHERE search_index MATCH ? ${typeFilter}
          ORDER BY rank
          LIMIT ?`
      )
      .all(match, ...(q.types ?? []), limit) as {
      type: EntityType
      id: string
      title: string
      snippet: string
      rank: number
    }[]
    return rows.map((r) => ({ ...r, snippet: r.snippet ?? '' }))
  }

  count(): number {
    return (this.ctx.sqlite.prepare('SELECT count(*) AS c FROM search_index').get() as { c: number }).c
  }

  /** Rebuilds the whole index from the tables (first run, after restore). */
  rebuild(): void {
    this.ctx.tx(() => {
      this.ctx.sqlite.prepare('DELETE FROM search_index').run()
      for (const d of this.registry.all()) {
        const rows = this.ctx.orm.select().from(d.table).where(this.registry.live(d)).all() as AnyRow[]
        for (const row of rows) this.upsert(d.type, row.id, d.searchDoc(row))
      }
    })
  }
}
