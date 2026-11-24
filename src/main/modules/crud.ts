import type { SQL } from 'drizzle-orm'
import type { z } from 'zod'
import type { CrudApi } from '@shared/api'
import type { SoftRepository } from '../core/soft-repository'
import type { AnyRow } from '../core/registry'
import { idArg, splitTags, updateArgs } from './context'

interface CrudOptions<TRow extends AnyRow, TEntity extends { id: string }, TQuery> {
  repo: SoftRepository<TRow, TEntity>
  input: z.ZodType<Record<string, unknown> & { tagIds?: string[] }>
  patch: z.ZodType<Record<string, unknown> & { tagIds?: string[] }>
  query?: z.ZodType<TQuery>
  /** Turns a parsed list query into WHERE conditions. */
  where?: (q: TQuery) => (SQL | undefined)[]
  orderBy?: SQL[]
  /** Derives extra column values on create/update (e.g. finishedAt). */
  beforeWrite?: (data: Record<string, unknown>, current?: TRow) => Record<string, unknown>
}

/**
 * Builds the standard CRUD API for a module from its repository + zod schemas.
 * Keeps simple modules declarative (DRY) while complex ones can still write their own.
 */
export function createCrudApi<TRow extends AnyRow, TEntity extends { id: string }, TInput, TPatch, TQuery>(
  o: CrudOptions<TRow, TEntity, TQuery>
): CrudApi<TEntity, TInput, TPatch, TQuery> {
  return {
    list: async (query) => {
      const q = (o.query ? o.query.parse(query ?? {}) : {}) as TQuery
      return o.repo.listWhere(o.where?.(q) ?? [], o.orderBy)
    },
    get: async (id) => o.repo.get(idArg.parse(id)),
    create: async (input) => {
      const [data, tagIds] = splitTags(o.input.parse(input))
      const values = o.beforeWrite ? o.beforeWrite(data) : data
      return o.repo.insert(values as never, tagIds)
    },
    update: async (args) => {
      const { id, patch } = updateArgs(o.patch).parse(args)
      const [data, tagIds] = splitTags(patch as Record<string, unknown> & { tagIds?: string[] })
      const values = o.beforeWrite ? o.beforeWrite(data, o.repo.rowOrThrow(id)) : data
      return o.repo.patch(id, values as Partial<TRow>, tagIds)
    },
    remove: async (id) => o.repo.softDelete(idArg.parse(id))
  }
}
