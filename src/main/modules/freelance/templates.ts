import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { TemplatesApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import {
  builtinSituationOf,
  duplicateVersionName,
  templateVersions,
  TEMPLATE_DIRECTIONS,
  TEMPLATE_SITUATIONS,
  templateInputSchema,
  templatePatchSchema,
  templateSituationSchema,
  withPurpose,
  type MessageTemplate
} from '@shared/domain/freelance'
import { messageTemplates, proposals } from '../../db/schema'
import type { Orm } from '../../db/client'
import { idArg, splitTags, updateArgs, type ModuleContext } from '../context'
import { UserError } from '../../core/util'
import type { TemplateRepo } from './shared'

/**
 * Groups follow the chips (TEMPLATE_SITUATIONS), not the English enum keys; the person's own situations come after
 * them, alphabetically; the newest template tops its group.
 */
const SITUATION_ORDER = sql`CASE ${messageTemplates.situation} ${sql.join(
  TEMPLATE_SITUATIONS.map((s, i) => sql`WHEN ${s} THEN ${i}`),
  sql` `
)} ELSE ${TEMPLATE_SITUATIONS.length} END`
const OWN_SITUATION_ORDER = sql`ulower(${messageTemplates.situation})`

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

  /**
   * The situation to store for a typed one: a built-in label or key in any case → the key («відгук» → proposal); an
   * own text that differs only in case from one already used → that spelling (no «Привітання HR» / «привітання hr»).
   */
  situationOf(text: string): string {
    const builtin = builtinSituationOf(text)
    if (builtin) return builtin
    const same = this.db
      .select({ situation: messageTemplates.situation })
      .from(messageTemplates)
      .where(sql`ulower(${messageTemplates.situation}) = ulower(${text})`)
      .orderBy(asc(messageTemplates.createdAt))
      .limit(1)
      .get()
    return same?.situation ?? text
  }

  /** One template never has two versions with the same name (in any case; an unnamed first is «Основна»). */
  private checkVersionNames(t: Parameters<typeof templateVersions>[0]): void {
    const twice = duplicateVersionName(templateVersions(t).map((v) => v.name))
    if (twice) throw new UserError(`Версія «${twice}» у цьому шаблоні вже є — дайте іншу назву`)
  }

  api(): TemplatesApi {
    const repo = this.repo
    const one = (id: string): MessageTemplate => this.withStats([repo.getOrThrow(id)])[0]
    return {
      list: async (query) => {
        const q = z
          .object({
            situation: templateSituationSchema.optional(),
            /** A direction: its own templates and the «Будь-де» ones. */
            purpose: z.enum(TEMPLATE_DIRECTIONS).optional(),
            search: z.string().max(200).optional(),
            tagId: idArg.optional()
          })
          .parse(query ?? {})
        return this.withStats(
          repo.listFavoritesFirst(
            [
              q.situation ? eq(messageTemplates.situation, q.situation) : undefined,
              q.purpose ? inArray(messageTemplates.purpose, [q.purpose, 'any']) : undefined,
              repo.hasTag(q.tagId),
              // The other text versions too (their JSON keeps Cyrillic as typed, so words match).
              repo.matches(q.search, [
                messageTemplates.title,
                messageTemplates.trigger,
                messageTemplates.body,
                messageTemplates.versions
              ])
            ],
            [SITUATION_ORDER, OWN_SITUATION_ORDER, desc(messageTemplates.updatedAt)],
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
        const parsed = templateInputSchema.parse(input)
        this.checkVersionNames(parsed)
        const [data, tagIds] = splitTags(
          withPurpose({ ...parsed, situation: this.situationOf(parsed.situation) })
        )
        // `niche` («Тип завдання») is no longer written: the column stays for the values from before.
        return one(repo.insert({ ...data, niche: '', copyCount: 0 }, tagIds).id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(templatePatchSchema).parse(args)
        if (patch.bodyName !== undefined || patch.versions !== undefined) {
          const row = repo.rowOrThrow(id)
          this.checkVersionNames({
            bodyName: patch.bodyName ?? row.bodyName,
            body: '',
            versions: patch.versions ?? row.versions
          })
        }
        // A new situation never changes «Для чого»: the person may have set it.
        const [data, tagIds] = splitTags(
          patch.situation === undefined ? patch : { ...patch, situation: this.situationOf(patch.situation) }
        )
        repo.patch(id, data, tagIds)
        return one(id)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      situations: async () =>
        this.db
          .selectDistinct({ situation: messageTemplates.situation })
          .from(messageTemplates)
          .where(
            and(
              isNull(messageTemplates.deletedAt),
              notInArray(messageTemplates.situation, [...TEMPLATE_SITUATIONS])
            )
          )
          .all()
          .map((r) => r.situation)
          .sort((a, b) => a.localeCompare(b, 'uk')),
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
