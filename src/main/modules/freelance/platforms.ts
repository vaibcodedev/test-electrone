import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { PlatformsApi } from '@shared/api'
import type { Currency } from '@shared/domain/crm'
import { platformInputSchema, platformPatchSchema, type Platform, type PlatformKind } from '@shared/domain/freelance'
import { platforms } from '../../db/schema'
import type { Orm } from '../../db/client'
import { nextPosition, reorder } from '../../core/ordering'
import { newId, now, NotFoundError, UserError } from '../../core/util'
import { idArg, orderedIds, updateArgs, type ModuleContext } from '../context'

/** Freelance platforms (Upwork, direct orders…): fees, credit prices, manual order. */
export class Platforms {
  constructor(private readonly m: ModuleContext) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  hasAny(): boolean {
    return !!this.db.select({ id: platforms.id }).from(platforms).limit(1).get()
  }

  private toPlatform(r: typeof platforms.$inferSelect): Platform {
    return { ...r, kind: r.kind as PlatformKind, currency: r.currency as Currency }
  }

  get(id: string): Platform {
    const r = this.db.select().from(platforms).where(eq(platforms.id, id)).get()
    if (!r) throw new NotFoundError('Платформа', id)
    return this.toPlatform(r)
  }

  /**
   * Rejects a platform name already in use (trimmed, case-insensitive for any script — in JS, since
   * SQLite lower() folds ASCII only). Archived platforms count: they come back with their history.
   */
  private assertNameFree(name: string, exceptId?: string): void {
    const key = name.trim().toLocaleLowerCase('uk')
    const taken = this.db
      .select({ id: platforms.id, name: platforms.name })
      .from(platforms)
      .all()
      .find((p) => p.id !== exceptId && p.name.trim().toLocaleLowerCase('uk') === key)
    if (taken) throw new UserError(`Платформа «${taken.name}» вже є — оберіть іншу назву`)
  }

  api(): PlatformsApi {
    return {
      list: async (args) => {
        const { includeArchived } = z
          .object({ includeArchived: z.boolean().optional() })
          .parse(args ?? {})
        return this.db
          .select()
          .from(platforms)
          .where(includeArchived ? undefined : eq(platforms.archived, false))
          .orderBy(asc(platforms.position), asc(platforms.createdAt))
          .all()
          .map((r) => this.toPlatform(r))
      },
      get: async (id) => {
        const r = this.db
          .select()
          .from(platforms)
          .where(eq(platforms.id, idArg.parse(id)))
          .get()
        return r ? this.toPlatform(r) : null
      },
      create: async (input) => {
        const data = platformInputSchema.parse(input)
        this.assertNameFree(data.name)
        const ts = now()
        const row = this.db
          .insert(platforms)
          .values({
            ...data,
            id: newId(),
            position: nextPosition(this.m.db, platforms.position),
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
        return this.toPlatform(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(platformPatchSchema).parse(args)
        if (patch.name !== undefined) this.assertNameFree(patch.name, id)
        const row = this.db
          .update(platforms)
          .set({ ...patch, updatedAt: now() })
          .where(eq(platforms.id, id))
          .returning()
          .get()
        if (!row) throw new NotFoundError('Платформа', id)
        return this.toPlatform(row)
      },
      reorder: async (ids) => reorder(this.m.db, platforms, platforms.id, orderedIds.parse(ids))
    }
  }
}
