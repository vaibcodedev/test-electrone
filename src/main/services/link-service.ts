import { and, eq, or } from 'drizzle-orm'
import type { EntityType } from '@shared/entity-types'
import type { EntityRef } from '@shared/domain/common'
import { linkInputSchema, type LinkedEntity, type LinkInput } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { entityLinks } from '../db/schema'
import type { EntityRegistry } from '../core/registry'
import { newId, now, UserError } from '../core/util'

/** Bidirectional relations between any two entities: idea → board → snippets → designs… */
export class LinkService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry
  ) {}

  list(ref: EntityRef): LinkedEntity[] {
    const rows = this.ctx.orm
      .select()
      .from(entityLinks)
      .where(
        or(
          and(eq(entityLinks.fromType, ref.type), eq(entityLinks.fromId, ref.id)),
          and(eq(entityLinks.toType, ref.type), eq(entityLinks.toId, ref.id))
        )
      )
      .all()
    const items = rows.map((r) => {
      const out = r.fromType === ref.type && r.fromId === ref.id
      return {
        linkId: r.id,
        direction: (out ? 'out' : 'in') as 'out' | 'in',
        ref: { type: (out ? r.toType : r.fromType) as EntityType, id: out ? r.toId : r.fromId }
      }
    })
    const summaries = this.registry.summarize(items.map((i) => i.ref))
    const byKey = new Map(summaries.map((s) => [`${s.type}:${s.id}`, s]))
    return items.flatMap((i) => {
      const s = byKey.get(`${i.ref.type}:${i.ref.id}`)
      return s ? [{ ...s, linkId: i.linkId, direction: i.direction }] : []
    })
  }

  create(input: LinkInput): void {
    const data = linkInputSchema.parse(input)
    if (data.fromType === data.toType && data.fromId === data.toId) {
      throw new UserError('Не можна пов’язати об’єкт із самим собою')
    }
    const exists = this.ctx.orm
      .select({ id: entityLinks.id })
      .from(entityLinks)
      .where(
        or(
          and(
            eq(entityLinks.fromType, data.fromType),
            eq(entityLinks.fromId, data.fromId),
            eq(entityLinks.toType, data.toType),
            eq(entityLinks.toId, data.toId)
          ),
          and(
            eq(entityLinks.fromType, data.toType),
            eq(entityLinks.fromId, data.toId),
            eq(entityLinks.toType, data.fromType),
            eq(entityLinks.toId, data.fromId)
          )
        )
      )
      .get()
    if (exists) return
    this.ctx.orm.insert(entityLinks).values({ id: newId(), ...data, createdAt: now() }).run()
  }

  remove(linkId: string): void {
    this.ctx.orm.delete(entityLinks).where(eq(entityLinks.id, linkId)).run()
  }

  clearFor(ref: EntityRef): void {
    this.ctx.orm
      .delete(entityLinks)
      .where(
        or(
          and(eq(entityLinks.fromType, ref.type), eq(entityLinks.fromId, ref.id)),
          and(eq(entityLinks.toType, ref.type), eq(entityLinks.toId, ref.id))
        )
      )
      .run()
  }
}
