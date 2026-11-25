import { and, asc, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { JobsApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import { companyInputSchema, companyPatchSchema, type Company } from '@shared/domain/jobs'
import { applications, companies } from '../../db/schema'
import type { Orm } from '../../db/client'
import { UserError } from '../../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from '../context'
import type { CompanyRepo } from './shared'

type CompaniesApi = Pick<
  JobsApi,
  'companies' | 'findCompany' | 'company' | 'createCompany' | 'updateCompany' | 'removeCompany'
>

/** Company cards: one per company name (case-insensitive), with vacancy counters. */
export class Companies {
  constructor(
    private readonly m: ModuleContext,
    private readonly repo: CompanyRepo
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  /** Company with the same name, compared trimmed and case-insensitively (in JS: SQLite lower() is ASCII-only). */
  private byName(name: string): ReturnType<CompanyRepo['get']> {
    const key = name.trim().toLocaleLowerCase('uk')
    if (!key) return null
    const hit = this.db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(isNull(companies.deletedAt))
      .all()
      .find((c) => c.name.trim().toLocaleLowerCase('uk') === key)
    return hit ? this.repo.get(hit.id) : null
  }

  private withCounts(list: Omit<Company, 'applicationCount' | 'activeCount'>[]): Company[] {
    if (!list.length) return []
    const counts = this.db
      .select({
        companyId: applications.companyId,
        total: sql<number>`count(*)`,
        active: sql<number>`sum(CASE WHEN ${applications.closedAt} IS NULL THEN 1 ELSE 0 END)`
      })
      .from(applications)
      .where(
        and(
          isNull(applications.deletedAt),
          inArray(
            applications.companyId,
            list.map((c) => c.id)
          )
        )
      )
      .groupBy(applications.companyId)
      .all()
    return list.map((c) => {
      const k = counts.find((x) => x.companyId === c.id)
      return { ...c, applicationCount: k?.total ?? 0, activeCount: k?.active ?? 0 }
    })
  }

  api(): CompaniesApi {
    const cos = this.repo
    return {
      companies: async (query) => {
        const q = z.object({ search: z.string().max(200).optional() }).extend(pageSchema.shape).parse(query ?? {})
        return this.withCounts(
          cos.listWhere(
            [cos.matches(q.search, [companies.name, companies.stack, companies.notes])],
            [asc(companies.name)],
            q.limit,
            q.offset
          )
        )
      },
      findCompany: async (name) => {
        const row = this.byName(z.string().max(200).parse(name))
        return row ? this.withCounts([row])[0] : null
      },
      company: async (id) => {
        const c = cos.get(idArg.parse(id))
        return c ? this.withCounts([c])[0] : null
      },
      createCompany: async (input) => {
        const [data, tagIds] = splitTags(companyInputSchema.parse(input))
        // Same name (case-insensitive, trimmed) → the existing company, never a duplicate.
        const existing = this.byName(data.name)
        if (existing) return this.withCounts([existing])[0]
        return this.withCounts([cos.insert(data, tagIds)])[0]
      },
      updateCompany: async (args) => {
        const { id, patch } = updateArgs(companyPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        // Renaming into another company's name (any case) would make two cards for one company.
        const same = data.name !== undefined ? this.byName(data.name) : null
        if (same && same.id !== id) throw new UserError(`Компанія «${same.name}» вже є — оберіть іншу назву`)
        return this.withCounts([cos.patch(id, data, tagIds)])[0]
      },
      removeCompany: async (id) => cos.softDelete(idArg.parse(id))
    }
  }
}
