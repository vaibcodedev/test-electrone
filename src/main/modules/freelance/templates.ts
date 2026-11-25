import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { TemplatesApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import {
  TEMPLATE_SITUATIONS,
  templateInputSchema,
  templatePatchSchema,
  type MessageTemplate
} from '@shared/domain/freelance'
import { messageTemplates, proposals } from '../../db/schema'
import type { Orm } from '../../db/client'
import { idArg, splitTags, updateArgs, type ModuleContext } from '../context'
import type { TemplateRepo } from './shared'

/** Groups follow the chips (TEMPLATE_SITUATIONS), not the English enum keys; the newest template tops its group. */
const SITUATION_ORDER = sql`CASE ${messageTemplates.situation} ${sql.join(
  TEMPLATE_SITUATIONS.map((s, i) => sql`WHEN ${s} THEN ${i}`),
  sql` `
)} ELSE ${TEMPLATE_SITUATIONS.length} END`

/** Message templates (proposals, first messages, follow-ups…) with how often they got replies and contracts. */
export class Templates {
  constructor(
    private readonly m: ModuleContext,
    readonly repo: TemplateRepo
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  withStats(list: Omit<MessageTemplate, 'usedIn' | 'replied' | 'hired'>[]): MessageTemplate[] {
    if (!list.length) return []
    const rows = this.db
      .select({
        templateId: proposals.templateId,
        used: sql<number>`count(*)`,
        replied: sql<number>`sum(CASE WHEN ${proposals.repliedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
        hired: sql<number>`sum(CASE WHEN ${proposals.hiredAt} IS NOT NULL THEN 1 ELSE 0 END)`
      })
      .from(proposals)
      .where(
        and(
          isNull(proposals.deletedAt),
          isNotNull(proposals.templateId),
          sql`${proposals.status} != 'draft'`
        )
      )
      .groupBy(proposals.templateId)
      .all()
    const byId = new Map(rows.map((r) => [r.templateId, r]))
    return list.map((t) => ({
      ...t,
      usedIn: byId.get(t.id)?.used ?? 0,
      replied: byId.get(t.id)?.replied ?? 0,
      hired: byId.get(t.id)?.hired ?? 0
    }))
  }

  api(): TemplatesApi {
    const repo = this.repo
    const one = (id: string): MessageTemplate => this.withStats([repo.getOrThrow(id)])[0]
    return {
      list: async (query) => {
        const q = z
          .object({
            situation: z.enum(TEMPLATE_SITUATIONS).optional(),
            search: z.string().max(200).optional(),
            tagId: idArg.optional()
          })
          .parse(query ?? {})
        return this.withStats(
          repo.listWhere(
            [
              q.situation ? eq(messageTemplates.situation, q.situation) : undefined,
              repo.hasTag(q.tagId),
              repo.matches(q.search, [
                messageTemplates.title,
                messageTemplates.trigger,
                messageTemplates.body
              ])
            ],
            [SITUATION_ORDER, desc(messageTemplates.updatedAt)],
            pageSchema.parse(query ?? {}).limit,
            pageSchema.parse(query ?? {}).offset
          )
        )
      },
      get: async (id) => {
        const t = repo.get(idArg.parse(id))
        return t ? this.withStats([t])[0] : null
      },
      create: async (input) => {
        const [data, tagIds] = splitTags(templateInputSchema.parse(input))
        return one(repo.insert({ ...data, copyCount: 0 }, tagIds).id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(templatePatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        repo.patch(id, data, tagIds)
        return one(id)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      markCopied: async (id) => {
        this.db
          .update(messageTemplates)
          .set({ copyCount: sql`${messageTemplates.copyCount} + 1` })
          .where(eq(messageTemplates.id, idArg.parse(id)))
          .run()
      }
    }
  }
}
