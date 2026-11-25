import { and, inArray } from 'drizzle-orm'
import type { MentionsApi } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import { entityRefSchema, type EntityRef } from '@shared/domain/common'
import { resolveLinksSchema, type Mention, type ResolvedLink } from '@shared/domain/mentions'
import { findWikiLinks, mentionFragment, refKey, vaultHref } from '@shared/wikilinks'
import type { DbContext } from '../db/client'
import type { AnyRow, EntityDescriptor, EntityRegistry } from '../core/registry'

/** Index hits checked per lookup: far more records than ever link to one, and a bound for a pathological base. */
const CANDIDATES = 300
/** Rows the «Згадки» block gets. */
const SHOWN = 50

/**
 * Record links typed with «[[» (`[Назва](vault:type/id)`, see shared/wikilinks.ts): «Згадки» of a record and the
 * current state of the records a text links to.
 *
 * Backlinks need no table of their own: the FTS5 search index already holds the text of every live record
 * (`searchDoc` — every text field) and is kept in sync on save, «Скасувати», trash, restore and backup restore.
 * A phrase query on the link's tokens («vault note 1b9d… …») finds the candidates through the index instead of a
 * table scan; their rows are then parsed for real, so the fragment comes from the full text and a mere mention
 * of the id elsewhere doesn't count. Records in the trash (and cards of a trashed board) are not in the index,
 * and `registry.live` filters once more. Limit: the index keeps the first 20 000 characters of a body, so a link
 * further down a huge text is not found.
 */
export class MentionService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry
  ) {}

  list(target: EntityRef): Mention[] {
    const phrase = `body : "${vaultHref(target).replace(/"/g, '""')}"`
    const hits = this.ctx.sqlite
      .prepare(
        'SELECT entity_type AS type, entity_id AS id FROM search_index WHERE search_index MATCH ? LIMIT ?'
      )
      .all(phrase, CANDIDATES) as EntityRef[]
    if (!hits.length) return []
    const descriptors = new Map<EntityType, EntityDescriptor>(
      this.registry.all().map((d) => [d.type, d])
    )
    const byType = new Map<EntityType, string[]>()
    for (const h of hits) {
      if (h.type === target.type && h.id === target.id) continue
      byType.set(h.type, [...(byType.get(h.type) ?? []), h.id])
    }
    // The link reads as the record's current title; the label typed in the text is the fallback.
    const title = this.registry.summarize([target], { withDeleted: true })[0]?.title
    const out: Mention[] = []
    for (const [type, ids] of byType) {
      const d = descriptors.get(type)
      if (!d) continue
      const rows = this.ctx.orm
        .select()
        .from(d.table)
        .where(and(inArray(d.table.id, ids), this.registry.live(d)))
        .all() as AnyRow[]
      for (const row of rows) {
        const body = d.searchDoc(row).body
        const links = findWikiLinks(body).filter(
          (m) => m.ref.type === target.type && m.ref.id === target.id
        )
        if (!links.length) continue
        out.push({
          type,
          id: row.id,
          ...d.summary(row),
          updatedAt: row.updatedAt,
          label: title ?? links[0].label,
          fragment: mentionFragment(body, links[0]),
          count: links.length
        })
      }
    }
    return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, SHOWN)
  }

  /** In the order asked; a record in the trash (or a card of a trashed board) is `trashed`, a purged one `missing`. */
  resolve(refs: EntityRef[]): ResolvedLink[] {
    const known = new Map(
      this.registry.summarize(refs, { withDeleted: true }).map((s) => [refKey(s), s])
    )
    const live = new Set(this.registry.summarize(refs).map(refKey))
    return refs.map((r) => {
      const s = known.get(refKey(r))
      if (!s) return { type: r.type, id: r.id, title: '', state: 'missing' }
      return {
        type: r.type,
        id: r.id,
        title: s.title,
        state: live.has(refKey(r)) ? 'live' : 'trashed'
      }
    })
  }

  api(): MentionsApi {
    return {
      list: async (ref) => this.list(entityRefSchema.parse(ref)),
      resolve: async (refs) => this.resolve(resolveLinksSchema.parse(refs))
    }
  }
}
