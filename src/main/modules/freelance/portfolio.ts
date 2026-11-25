/** Portfolio cases (with a cover image) and red flags: plain CRUD over createCrudApi. */
import { asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { CasesApi, RedFlagsApi } from '@shared/api'
import { fileSourceSchema } from '@shared/domain/designs'
import {
  caseInputSchema,
  casePatchSchema,
  redFlagInputSchema,
  redFlagPatchSchema,
  type CaseInput,
  type CasePatch,
  type PortfolioCase,
  type RedFlag,
  type RedFlagInput,
  type RedFlagPatch
} from '@shared/domain/freelance'
import { portfolioCases, redFlags } from '../../db/schema'
import type { SoftRepository } from '../../core/soft-repository'
import { idArg, type ModuleContext } from '../context'
import { createCrudApi } from '../crud'

type CaseRow = typeof portfolioCases.$inferSelect
type RedFlagRow = typeof redFlags.$inferSelect
export type CaseRepo = SoftRepository<CaseRow, PortfolioCase>
export type RedFlagRepo = SoftRepository<RedFlagRow, RedFlag>

export function casesApi(m: ModuleContext, repo: CaseRepo): CasesApi {
  return {
    ...createCrudApi<
      CaseRow,
      PortfolioCase,
      CaseInput,
      CasePatch,
      { search?: string; niche?: string; tagId?: string }
    >({
      repo,
      input: caseInputSchema,
      patch: casePatchSchema,
      query: z.object({
        search: z.string().max(200).optional(),
        niche: z.string().max(100).optional(),
        tagId: idArg.optional()
      }),
      where: (q) => [
        q.niche ? eq(portfolioCases.niche, q.niche) : undefined,
        repo.hasTag(q.tagId),
        repo.matches(q.search, [
          portfolioCases.title,
          portfolioCases.whatDone,
          portfolioCases.textEn,
          portfolioCases.stack
        ])
      ],
      beforeWrite: (data, current) => (current ? data : { ...data, coverPath: null })
    }),
    setCover: async (args) => {
      const { id, source } = z.object({ id: idArg, source: fileSourceSchema }).parse(args)
      const current = repo.rowOrThrow(id)
      const stored = await m.files.import(source, { imagesOnly: true })
      const updated = repo.patch(id, { coverPath: stored.path })
      m.files.remove(current.coverPath)
      return updated
    }
  }
}

export function redFlagsApi(repo: RedFlagRepo): RedFlagsApi {
  return createCrudApi<RedFlagRow, RedFlag, RedFlagInput, RedFlagPatch, { search?: string }>({
    repo,
    input: redFlagInputSchema,
    patch: redFlagPatchSchema,
    query: z.object({ search: z.string().max(200).optional() }),
    where: (q) => [repo.matches(q.search, [redFlags.title, redFlags.signs, redFlags.action])],
    orderBy: [desc(redFlags.severity), asc(redFlags.title)]
  })
}
