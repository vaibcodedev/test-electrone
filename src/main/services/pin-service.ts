import { and, asc, eq, max, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { PinsApi } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import { entityRefSchema, type EntityRef } from '@shared/domain/common'
import { PIN_KINDS, type PinKind, type PinnedEntity } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { pins } from '../db/schema'
import type { EntityRegistry } from '../core/registry'
import { now, UserError } from '../core/util'

/** "Pinned to dashboard" and "favorite" marks for any entity. */
export class PinService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry
  ) {}

  list(kind?: PinKind): PinnedEntity[] {
    const rows = this.ctx.orm
      .select()
      .from(pins)
      .where(kind ? eq(pins.kind, kind) : undefined)
      .orderBy(asc(pins.position), asc(pins.createdAt))
      .all()
    const summaries = this.registry.summarize(
      rows.map((r) => ({ type: r.entityType as EntityType, id: r.entityId }))
    )
    const byKey = new Map(summaries.map((s) => [`${s.type}:${s.id}`, s]))
    return rows.flatMap((r) => {
      const s = byKey.get(`${r.entityType}:${r.entityId}`)
      return s ? [{ ...s, kind: r.kind, position: r.position }] : []
    })
  }

  private where(ref: EntityRef, kind: PinKind): SQL | undefined {
    return and(eq(pins.entityType, ref.type), eq(pins.entityId, ref.id), eq(pins.kind, kind))
  }

  toggle(ref: EntityRef, kind: PinKind): boolean {
    const exists = this.ctx.orm.select().from(pins).where(this.where(ref, kind)).get()
    if (exists) {
      this.ctx.orm.delete(pins).where(this.where(ref, kind)).run()
      return false
    }
    const last = this.ctx.orm
      .select({ m: max(pins.position) })
      .from(pins)
      .where(eq(pins.kind, kind))
      .get()
    this.ctx.orm
      .insert(pins)
      .values({
        entityType: ref.type,
        entityId: ref.id,
        kind,
        position: (last?.m ?? 0) + 1,
        createdAt: now()
      })
      .run()
    return true
  }

  state(ref: EntityRef): Record<PinKind, boolean> {
    const rows = this.ctx.orm
      .select({ kind: pins.kind })
      .from(pins)
      .where(and(eq(pins.entityType, ref.type), eq(pins.entityId, ref.id)))
      .all()
    return {
      pin: rows.some((r) => r.kind === 'pin'),
      favorite: rows.some((r) => r.kind === 'favorite')
    }
  }

  reorder(kind: PinKind, refs: EntityRef[]): void {
    this.ctx.tx(() => {
      refs.forEach((ref, i) => {
        this.ctx.orm.update(pins).set({ position: i }).where(this.where(ref, kind)).run()
      })
    })
  }

  clearFor(ref: EntityRef): void {
    this.ctx.orm
      .delete(pins)
      .where(and(eq(pins.entityType, ref.type), eq(pins.entityId, ref.id)))
      .run()
  }

  api(): PinsApi {
    const kindArg = z.enum(PIN_KINDS)
    return {
      list: async (kind) => this.list(kindArg.optional().parse(kind)),
      toggle: async (args) => {
        const { ref, kind } = z.object({ ref: entityRefSchema, kind: kindArg }).parse(args)
        if (!this.registry.findRow(ref))
          throw new UserError('Запис не знайдено — можливо, його видалено')
        return this.toggle(ref, kind)
      },
      state: async (ref) => this.state(entityRefSchema.parse(ref)),
      reorder: async (args) => {
        const { kind, refs } = z
          .object({ kind: kindArg, refs: z.array(entityRefSchema).max(1000) })
          .parse(args)
        this.reorder(kind, refs)
      }
    }
  }
}
