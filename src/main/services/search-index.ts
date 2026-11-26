import type { Database, Statement } from 'better-sqlite3'
import type { SearchApi } from '@shared/api'
import type { EntitySummary } from '@shared/domain/common'
import type { EntityType } from '@shared/entity-types'
import { readableSnippet } from '@shared/wikilinks'
import {
  recentQuerySchema,
  searchQuerySchema,
  type SearchHit,
  type SearchQuery
} from '@shared/domain/system'
import type { DbContext } from '../db/client'
import type { AnyRow, EntityRegistry } from '../core/registry'
import { searchWords, toFtsQuery } from '../core/util'
import type { FileHit, FileTextSource } from './attachment-text'

const MAX_BODY = 20_000
const DELETE_ONE = 'DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?'
const INSERT = 'INSERT INTO search_index (entity_type, entity_id, title, body) VALUES (?, ?, ?, ?)'
/** A file name longer than this is shortened in the snippet («У файлі «…»: …»), so the match stays in sight. */
const SNIPPET_NAME_MAX = 32
/** File-only hits that get a passage of the file; the rest show just the file name. */
const FILE_PASSAGES = 12
/** Matching files looked at per query (several may belong to one record, some to records in the trash). */
const FILE_CANDIDATES_MAX = 400

/** What the index stores: the record's text and what only search may see (searchDoc → indexOnly). */
function indexedBody(doc: { body: string; indexOnly?: string }): string {
  return (doc.indexOnly ? `${doc.body}\n${doc.indexOnly}` : doc.body).slice(0, MAX_BODY)
}

function shortName(name: string): string {
  return name.length > SNIPPET_NAME_MAX ? `${name.slice(0, SNIPPET_NAME_MAX - 1)}…` : name
}

/**
 * Wrapper over the FTS5 `search_index` table. Single responsibility: keep the index in sync and query it.
 * The text of attached PDFs has an index of its own (FileTextSource, `file_index`): saving a record never
 * touches it, and a query adds records found only in their files after the ones found by their own text.
 */
export class SearchIndex {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry,
    private readonly files: FileTextSource
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

  upsert(
    type: EntityType,
    id: string,
    doc: { title: string; body: string; indexOnly?: string }
  ): void {
    this.stmt(DELETE_ONE).run(type, id)
    this.stmt(INSERT).run(type, id, doc.title, indexedBody(doc))
  }

  indexRow(type: EntityType, row: AnyRow): void {
    if (row.deletedAt) return this.remove(type, row.id)
    this.upsert(type, row.id, this.registry.get(type).searchDoc(row))
  }

  remove(type: EntityType, id: string): void {
    this.stmt(DELETE_ONE).run(type, id)
  }

  /**
   * `any` — records with any of the words, best first (the chat's search over a question). `ownText` — the
   * record's own text only, not its files (the chat ШІ: what a PDF says never decides what goes to a provider).
   *
   * Records found by their own text come first. Then records found only in an attached file: all the words in
   * one file (words split between the record's text and its file, or between two files, don't make a hit).
   */
  query(q: SearchQuery, opts: { any?: boolean; ownText?: boolean } = {}): SearchHit[] {
    const match = toFtsQuery(q.text, opts.any)
    if (!match) return []
    const limit = q.limit ?? 40
    const typeFilter = q.types?.length
      ? `AND entity_type IN (${q.types.map(() => '?').join(',')})`
      : ''
    const own = (
      this.ctx.sqlite
        .prepare(
          `SELECT entity_type AS type, entity_id AS id, title,
                  snippet(search_index, 3, char(1), char(2), '…', 14) AS snippet,
                  bm25(search_index, 0, 0, 8.0, 1.0) AS rank
             FROM search_index
            WHERE search_index MATCH ? ${typeFilter}
            ORDER BY rank
            LIMIT ?`
        )
        .all(match, ...(q.types ?? []), limit) as SearchHit[]
    ).map((r) => ({ ...r, snippet: r.snippet ?? '' }))
    if (opts.ownText || own.length >= limit) return own
    return [...own, ...this.fileOnly(q, match, own, limit - own.length)]
  }

  /** Records found only in their files: the best file of each, live records only, a passage for the first few. */
  private fileOnly(q: SearchQuery, match: string, own: SearchHit[], room: number): SearchHit[] {
    const found = new Set(own.map((h) => `${h.type}:${h.id}`))
    const candidates = this.files.search(match, {
      types: q.types,
      limit: Math.min(FILE_CANDIDATES_MAX, room * 3 + found.size)
    })
    const best = new Map<string, FileHit>()
    for (const h of candidates) {
      const key = `${h.type}:${h.id}`
      if (!found.has(key) && !best.has(key)) best.set(key, h)
    }
    // A record in the trash keeps its files (a restore brings them back): never shown meanwhile.
    const byType = new Map<EntityType, string[]>()
    for (const h of best.values()) byType.set(h.type, [...(byType.get(h.type) ?? []), h.id])
    const live = new Set<string>()
    for (const [type, ids] of byType)
      for (const id of this.registry.liveIds(type, ids)) live.add(`${type}:${id}`)
    const words = searchWords(q.text)
    return [...best.values()]
      .filter((h) => live.has(`${h.type}:${h.id}`))
      .slice(0, room)
      .map((h, i) => {
        const label = `У файлі «${shortName(h.name)}»`
        const text = i < FILE_PASSAGES ? this.files.passage(h.textId, words) : ''
        return {
          type: h.type,
          id: h.id,
          title: '',
          rank: h.rank,
          snippet: text ? `${label}: ${text}` : label
        } as SearchHit
      })
  }

  count(): number {
    return (
      this.ctx.sqlite.prepare('SELECT count(*) AS c FROM search_index').get() as { c: number }
    ).c
  }

  /**
   * Rebuilds the whole index from the tables (first run, after restore). Plain inserts into the emptied
   * table: entity columns are UNINDEXED, so a per-row DELETE would scan the index each time (O(n²)).
   * The file index is not touched: it follows its table by triggers (AttachmentTextStore.ensureIndex).
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
          insert.run(d.type, row.id, doc.title, indexedBody(doc))
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
            // A record link in the text («[[») reads as its label, not as `](vault:note/1b9d…)`.
            snippet: readableSnippet(h.snippet),
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
