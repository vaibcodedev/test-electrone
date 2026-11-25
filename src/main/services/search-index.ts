import type { Database, Statement } from 'better-sqlite3'
import type { SearchApi } from '@shared/api'
import type { EntitySummary } from '@shared/domain/common'
import type { EntityType } from '@shared/entity-types'
import {
  recentQuerySchema,
  searchQuerySchema,
  type SearchHit,
  type SearchQuery
} from '@shared/domain/system'
import type { DbContext } from '../db/client'
import type { AnyRow, EntityRegistry } from '../core/registry'
import { toFtsQuery } from '../core/util'

const MAX_BODY = 20_000
const DELETE_ONE = 'DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?'
const INSERT = 'INSERT INTO search_index (entity_type, entity_id, title, body) VALUES (?, ?, ?, ?)'

/** Wrapper over the FTS5 `search_index` table. Single responsibility: keep the index in sync and query it. */
export class SearchIndex {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry
  ) {}

  /** Prepared once per connection (a backup restore opens a new one, so the cache is keyed by it). */
  private readonly statements = new WeakMap<Database, Map<string, Statement>>()

  private stmt(sql: string): Statement {
    const db = this.ctx.sqlite
    let cache = this.statements.get(db)
    if (!cache) this.statements.set(db, (cache = new Map()))
    let s = cache.get(sql)
    if (!s) cache.set(sql, (s = db.prepare(sql)))
    return s
  }

  upsert(type: EntityType, id: string, doc: { title: string; body: string }): void {
    this.stmt(DELETE_ONE).run(type, id)
    this.stmt(INSERT).run(type, id, doc.title, doc.body.slice(0, MAX_BODY))
  }

  indexRow(type: EntityType, row: AnyRow): void {
    if (row.deletedAt) return this.remove(type, row.id)
    this.upsert(type, row.id, this.registry.get(type).searchDoc(row))
  }

  remove(type: EntityType, id: string): void {
    this.stmt(DELETE_ONE).run(type, id)
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
    return (
      this.ctx.sqlite.prepare('SELECT count(*) AS c FROM search_index').get() as { c: number }
    ).c
  }

  /**
   * Rebuilds the whole index from the tables (first run, after restore). Plain inserts into the emptied
   * table: entity columns are UNINDEXED, so a per-row DELETE would scan the index each time (O(n²)).
   */
  rebuild(): void {
    this.ctx.tx(() => {
      this.ctx.sqlite.prepare('DELETE FROM search_index').run()
      const insert = this.stmt(INSERT)
      for (const d of this.registry.all()) {
        const rows = this.ctx.orm
          .select()
          .from(d.table)
          .where(this.registry.live(d))
          .all() as AnyRow[]
        for (const row of rows) {
          const doc = d.searchDoc(row)
          insert.run(d.type, row.id, doc.title, doc.body.slice(0, MAX_BODY))
        }
      }
    })
  }

  /** `recent` comes from the dashboard (recently changed records), the rest is the index. */
  api(recent: (limit?: number, types?: readonly EntityType[]) => EntitySummary[]): SearchApi {
    return {
      query: async (q) => {
        const hits = this.query(searchQuerySchema.parse(q))
        const found = new Map(this.registry.summarize(hits).map((s) => [`${s.type}:${s.id}`, s]))
        return hits
          .filter((h) => found.has(`${h.type}:${h.id}`))
          .map((h) => ({
            ...h,
            ...found.get(`${h.type}:${h.id}`)!,
            snippet: h.snippet,
            rank: h.rank
          }))
      },
      recent: async (args) => {
        const q = recentQuerySchema.parse(args)
        return typeof q === 'object' ? recent(q.limit, q.types) : recent(q)
      }
    }
  }
}
