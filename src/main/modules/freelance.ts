import { pageSchema } from '@shared/domain/common'
/**
 * Freelance hub backend: platforms, proposals pipeline, bid credits ledger, message templates,
 * portfolio cases, red flags, goals and funnel statistics.
 * Contracts and clients are CRM projects/clients with a platformId (no duplication).
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, max, sql } from 'drizzle-orm'
import { z } from 'zod'
import type {
  CasesApi,
  CreditsApi,
  FreelanceApi,
  GoalsApi,
  PlatformsApi,
  ProposalsApi,
  RedFlagsApi,
  TemplatesApi
} from '@shared/api'
import {
  BID_TYPES,
  caseInputSchema,
  casePatchSchema,
  creditTxInputSchema,
  goalInputSchema,
  goalPatchSchema,
  hireSchema,
  platformInputSchema,
  platformPatchSchema,
  PROPOSAL_STATUSES,
  proposalInputSchema,
  proposalListQuerySchema,
  proposalPatchSchema,
  redFlagInputSchema,
  redFlagPatchSchema,
  statsQuerySchema,
  TEMPLATE_SITUATIONS,
  templateInputSchema,
  templatePatchSchema,
  type BidType,
  type CaseInput,
  type CasePatch,
  type CreditKind,
  type CreditsSummary,
  type CreditTx,
  type FreelanceStats,
  type FunnelRow,
  type Goal,
  type GoalMetric,
  type GoalPeriod,
  type GoalProgress,
  type MessageTemplate,
  type Platform,
  type PlatformKind,
  type PortfolioCase,
  type Proposal,
  type ProposalStatus,
  type RedFlag,
  type RedFlagInput,
  type RedFlagPatch,
  type TemplateSituation
} from '@shared/domain/freelance'
import { fileSourceSchema } from '@shared/domain/designs'
import type { Currency } from '@shared/domain/crm'
import {
  clients,
  creditTxs,
  goals,
  messageTemplates,
  payments,
  platforms,
  portfolioCases,
  projects,
  proposals,
  redFlags
} from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import {
  DAY_MS,
  newId,
  now,
  NotFoundError,
  startOfDay,
  startOfMonth,
  startOfWeek,
  UserError
} from '../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'
import { createCrudApi } from './crud'
import type { CrmModule } from './crm'
import { FREELANCE_SEED } from './freelance-seeds'

type ProposalRow = typeof proposals.$inferSelect
type TemplateRow = typeof messageTemplates.$inferSelect
type CaseRow = typeof portfolioCases.$inferSelect
type RedFlagRow = typeof redFlags.$inferSelect

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  viewed: 'Просмотрен',
  replied: 'Ответили',
  interview: 'Интервью',
  offer: 'Оффер',
  hired: 'Контракт',
  declined: 'Отказ',
  no_reply: 'Без ответа',
  withdrawn: 'Отозван',
  closed: 'Вакансия закрыта'
}

const SITUATION_LABEL: Record<TemplateSituation, string> = {
  proposal: 'Отклик',
  first_message: 'Первое сообщение',
  estimate: 'Оценка сроков',
  tz_questions: 'Вопросы по ТЗ',
  revisions: 'Правки',
  follow_up: 'Напоминание',
  small_talk: 'Small talk',
  closing: 'Завершение',
  cover_letter: 'Сопроводительное',
  recruiter: 'Ответ рекрутеру',
  thank_you: 'Благодарность после интервью',
  other: 'Другое'
}

/** Pipeline rank: how far a status got. Terminal "negative" statuses rank by timestamps instead. */
const RANK: Partial<Record<ProposalStatus, number>> = {
  sent: 1,
  viewed: 2,
  replied: 3,
  interview: 4,
  offer: 5,
  hired: 6
}
const REPLIED_STATUSES: ProposalStatus[] = ['replied', 'interview', 'offer', 'hired']

const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 1000) / 10 : 0)

export class FreelanceModule {
  readonly descriptors: EntityDescriptor[]
  readonly proposalRepo: SoftRepository<ProposalRow, Proposal>
  private readonly templateRepo: SoftRepository<
    TemplateRow,
    Omit<MessageTemplate, 'usedIn' | 'replied' | 'hired'>
  >
  private readonly caseRepo: SoftRepository<CaseRow, PortfolioCase>
  private readonly flagRepo: SoftRepository<RedFlagRow, RedFlag>

  constructor(
    private readonly m: ModuleContext,
    private readonly crm: CrmModule
  ) {
    const proposal: EntityDescriptor = {
      type: 'proposal',
      table: proposals,
      searchDoc: (r) => ({
        title: r.jobTitle,
        body: `${r.niche}\n${r.clientName}\n${r.clientCountry}\n${r.coverLetter}\n${r.jobDescription}\n${r.notes}`
      }),
      summary: (r) => ({
        title: r.jobTitle,
        subtitle: PROPOSAL_STATUS_LABEL[r.status as ProposalStatus]
      })
    }
    const template: EntityDescriptor = {
      type: 'template',
      table: messageTemplates,
      searchDoc: (r) => ({
        title: r.title,
        body: `${r.trigger}\n${r.body}\n${r.note}\n${r.niche}`
      }),
      summary: (r) => ({
        title: r.title,
        subtitle: SITUATION_LABEL[r.situation as TemplateSituation]
      })
    }
    const portfolioCase: EntityDescriptor = {
      type: 'case',
      table: portfolioCases,
      searchDoc: (r) => ({
        title: r.title,
        body: `${r.niche}\n${r.client}\n${r.problem}\n${r.whatDone}\n${r.result}\n${r.stack}\n${r.textEn}`
      }),
      summary: (r) => ({ title: r.title, subtitle: r.niche || undefined }),
      onPurge: (r) => m.files.remove(r.coverPath)
    }
    const flag: EntityDescriptor = {
      type: 'redflag',
      table: redFlags,
      searchDoc: (r) => ({ title: r.title, body: `${r.signs}\n${r.action}` }),
      summary: (r) => ({ title: r.title, subtitle: 'Красный флаг' })
    }
    this.descriptors = [proposal, template, portfolioCase, flag]
    this.proposalRepo = new SoftRepository(m.repo, proposal, (r, tags) => ({
      ...r,
      status: r.status as ProposalStatus,
      bidType: r.bidType as BidType,
      tags
    }))
    this.templateRepo = new SoftRepository(m.repo, template, (r, tags) => ({
      ...r,
      situation: r.situation as TemplateSituation,
      tags
    }))
    this.caseRepo = new SoftRepository(m.repo, portfolioCase, (r, tags) => ({ ...r, tags }))
    this.flagRepo = new SoftRepository(m.repo, flag, (r, tags) => ({ ...r, tags }))
  }

  private get db() {
    return this.m.db.orm
  }

  /* ───────── seeds ───────── */

  /** First launch of the freelance hub: Upwork + direct orders, starter templates and red flags. */
  seedIfEmpty(): void {
    if (this.db.select({ id: platforms.id }).from(platforms).limit(1).get()) return
    const ts = now()
    this.m.db.tx(() => {
      FREELANCE_SEED.platforms.forEach((p, i) => {
        this.db
          .insert(platforms)
          .values({
            ...platformInputSchema.parse(p),
            id: newId(),
            position: i,
            createdAt: ts,
            updatedAt: ts
          })
          .run()
      })
      for (const t of FREELANCE_SEED.templates)
        this.templateRepo.insert({ ...templateInputSchema.parse(t), copyCount: 0 })
      for (const f of FREELANCE_SEED.redFlags) this.flagRepo.insert(redFlagInputSchema.parse(f))
    })
  }

  /* ───────── platforms ───────── */

  private toPlatform(r: typeof platforms.$inferSelect): Platform {
    return { ...r, kind: r.kind as PlatformKind, currency: r.currency as Currency }
  }

  platform(id: string): Platform {
    const r = this.db.select().from(platforms).where(eq(platforms.id, id)).get()
    if (!r) throw new NotFoundError('Платформа', id)
    return this.toPlatform(r)
  }

  platformsApi(): PlatformsApi {
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
        const last = this.db
          .select({ m: max(platforms.position) })
          .from(platforms)
          .get()
        const ts = now()
        const row = this.db
          .insert(platforms)
          .values({
            ...data,
            id: newId(),
            position: (last?.m ?? 0) + 1,
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
        return this.toPlatform(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(platformPatchSchema).parse(args)
        const row = this.db
          .update(platforms)
          .set({ ...patch, updatedAt: now() })
          .where(eq(platforms.id, id))
          .returning()
          .get()
        if (!row) throw new NotFoundError('Платформа', id)
        return this.toPlatform(row)
      },
      reorder: async (ids) => {
        const list = z.array(idArg).parse(ids)
        this.m.db.tx(() =>
          list.forEach((id, i) =>
            this.db.update(platforms).set({ position: i }).where(eq(platforms.id, id)).run()
          )
        )
      }
    }
  }

  /* ───────── proposals ───────── */

  /** Fills repliedAt/hiredAt the first time a proposal reaches those stages. */
  private stamps(next: ProposalStatus | undefined, current?: ProposalRow): Partial<ProposalRow> {
    if (!next) return {}
    const ts = now()
    const out: Partial<ProposalRow> = {}
    if (REPLIED_STATUSES.includes(next) && !current?.repliedAt) out.repliedAt = ts
    if (next === 'hired' && !current?.hiredAt) out.hiredAt = ts
    if (next !== 'draft' && !current?.sentAt) out.sentAt = current?.sentAt ?? ts
    return out
  }

  proposalsApi(): ProposalsApi {
    const repo = this.proposalRepo
    return {
      list: async (query) => {
        const q = proposalListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return repo.listWhere(
          [
            q.platformId ? eq(proposals.platformId, q.platformId) : undefined,
            q.status ? eq(proposals.status, q.status) : undefined,
            q.niche ? eq(proposals.niche, q.niche) : undefined,
            q.starred ? eq(proposals.starred, true) : undefined,
            repo.hasTag(q.tagId),
            repo.matches(q.search, [
              proposals.jobTitle,
              proposals.clientName,
              proposals.coverLetter,
              proposals.niche
            ])
          ],
          [sql`coalesce(${proposals.sentAt}, ${proposals.createdAt}) DESC`],
          page.limit,
          page.offset
        )
      },
      get: async (id) => repo.get(idArg.parse(id)),
      create: async (input) => {
        const [data, tagIds] = splitTags(proposalInputSchema.parse(input))
        this.platform(data.platformId)
        return repo.insert(
          {
            ...data,
            sentAt: data.sentAt ?? (data.status === 'draft' ? null : now()),
            repliedAt: null,
            hiredAt: null,
            projectId: null,
            ...this.stamps(data.status)
          },
          tagIds
        )
      },
      update: async (args) => {
        const { id, patch } = updateArgs(proposalPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        const current = repo.rowOrThrow(id)
        return repo.patch(id, { ...data, ...this.stamps(data.status, current) }, tagIds)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      niches: async () =>
        this.db
          .selectDistinct({ niche: proposals.niche })
          .from(proposals)
          .where(and(isNull(proposals.deletedAt), sql`${proposals.niche} != ''`))
          .all()
          .map((r) => r.niche)
          .sort((a, b) => a.localeCompare(b, 'ru')),
      stale: async (args) => {
        const { days, platformId } = z
          .object({
            days: z.number().int().min(1).max(60).optional(),
            platformId: idArg.optional()
          })
          .parse(args ?? {})
        const cutoff = now() - (days ?? 3) * DAY_MS
        return repo.listWhere(
          [
            inArray(proposals.status, ['sent', 'viewed']),
            lte(proposals.sentAt, cutoff),
            platformId ? eq(proposals.platformId, platformId) : undefined
          ],
          [asc(proposals.sentAt)],
          50
        )
      },
      hire: async (input) => {
        const data = hireSchema.parse(input)
        const p = repo.rowOrThrow(data.proposalId)
        const platform = this.platform(p.platformId)
        const ids = await this.m.db.tx(() => {
          let clientId = data.clientId ?? p.clientId
          if (!clientId) {
            const created = this.crm.clientRepo.insert({
              name: p.clientName || 'Клиент',
              company: '',
              email: '',
              phone: '',
              messenger: '',
              website: '',
              notes: '',
              status: 'active',
              currency: platform.currency,
              defaultBilling: data.billing,
              defaultRate: data.billing === 'hourly' ? data.amount : 0,
              platformId: p.platformId,
              country: p.clientCountry,
              rating: p.clientRating,
              totalSpent: p.clientSpent,
              hireRate: p.clientHireRate,
              paymentVerified: p.paymentVerified,
              howToCommunicate: ''
            })
            clientId = created.id
          }
          const project = this.crm.projectRepo.insert({
            clientId,
            title: data.title,
            description: p.jobDescription,
            status: 'active',
            billing: data.billing,
            rate: data.billing === 'hourly' ? data.amount : 0,
            fixedPrice: data.billing === 'fixed' ? data.amount : 0,
            currency: platform.currency,
            budgetHours: 0,
            startAt: now(),
            dueAt: null,
            repoUrl: '',
            stagingUrl: '',
            prodUrl: '',
            adminUrl: p.jobUrl,
            platformId: p.platformId,
            feePercent: data.feePercent,
            proposalId: p.id
          })
          repo.patch(p.id, {
            status: 'hired',
            clientId,
            projectId: project.id,
            ...this.stamps('hired', p)
          })
          return { projectId: project.id, clientId }
        })
        this.m.links.create({
          fromType: 'proposal',
          fromId: p.id,
          toType: 'project',
          toId: ids.projectId
        })
        return ids
      },
      toTemplate: async (id) => {
        const p = repo.rowOrThrow(idArg.parse(id))
        if (!p.coverLetter.trim()) throw new UserError('В отклике нет текста')
        const t = this.templateRepo.insert({
          situation: 'proposal',
          title: p.niche ? `${p.niche}: ${p.jobTitle}`.slice(0, 200) : p.jobTitle.slice(0, 200),
          trigger: '',
          body: p.coverLetter,
          note: '',
          niche: p.niche,
          copyCount: 0
        })
        return this.withTemplateStats([t])[0]
      }
    }
  }

  /* ───────── credits ───────── */

  creditsSummary(platformId: string): CreditsSummary {
    const txs = this.db.select().from(creditTxs).where(eq(creditTxs.platformId, platformId)).all()
    const sum = (kind: CreditKind, f: 'amount' | 'cost' = 'amount'): number =>
      txs.filter((t) => t.kind === kind).reduce((s, t) => s + t[f], 0)
    const spentRow = this.db
      .select({
        spent: sql<number>`coalesce(sum(${proposals.credits} + ${proposals.boostCredits}), 0)`,
        hired: sql<number>`coalesce(sum(CASE WHEN ${proposals.status} = 'hired' OR ${proposals.hiredAt} IS NOT NULL THEN 1 ELSE 0 END), 0)`
      })
      .from(proposals)
      .where(
        and(
          eq(proposals.platformId, platformId),
          isNull(proposals.deletedAt),
          sql`${proposals.status} != 'draft'`
        )
      )
      .get()
    const purchased = sum('purchase')
    const moneySpent = sum('purchase', 'cost')
    const spent = spentRow?.spent ?? 0
    const contracts = spentRow?.hired ?? 0
    const avg = purchased ? moneySpent / purchased : this.platform(platformId).creditPrice || null
    const r2 = (n: number): number => Math.round(n * 100) / 100
    return {
      platformId,
      purchased,
      bonus: sum('bonus'),
      refunded: sum('refund'),
      spent,
      balance: purchased + sum('bonus') + sum('refund') + sum('adjust') - spent,
      moneySpent: r2(moneySpent),
      avgCreditPrice: avg === null ? null : Math.round(avg * 1000) / 1000,
      contracts,
      costPerContract: contracts && avg !== null ? r2((spent * avg) / contracts) : null,
      creditsPerContract: contracts ? Math.round(spent / contracts) : null
    }
  }

  creditsApi(): CreditsApi {
    return {
      list: async (args) => {
        const { platformId } = z.object({ platformId: idArg }).parse(args)
        return this.db
          .select()
          .from(creditTxs)
          .where(eq(creditTxs.platformId, platformId))
          .orderBy(desc(creditTxs.at))
          .all() as CreditTx[]
      },
      add: async (input) => {
        const data = creditTxInputSchema.parse(input)
        this.platform(data.platformId)
        if (data.kind !== 'adjust' && data.amount < 0)
          throw new UserError('Количество должно быть положительным')
        const row = this.db
          .insert(creditTxs)
          .values({ ...data, id: newId(), createdAt: now() })
          .returning()
          .get()
        return row as CreditTx
      },
      remove: async (id) => {
        this.db
          .delete(creditTxs)
          .where(eq(creditTxs.id, idArg.parse(id)))
          .run()
      },
      summary: async (args) =>
        this.creditsSummary(z.object({ platformId: idArg }).parse(args).platformId)
    }
  }

  /** Purchases in range grouped by platform currency (finance report). */
  creditPurchases(from: number, to: number): { currency: Currency; cost: number }[] {
    return this.db
      .select({ currency: platforms.currency, cost: sql<number>`sum(${creditTxs.cost})` })
      .from(creditTxs)
      .innerJoin(platforms, eq(platforms.id, creditTxs.platformId))
      .where(and(eq(creditTxs.kind, 'purchase'), gte(creditTxs.at, from), lte(creditTxs.at, to)))
      .groupBy(platforms.currency)
      .all() as { currency: Currency; cost: number }[]
  }

  /* ───────── templates ───────── */

  private withTemplateStats(
    list: Omit<MessageTemplate, 'usedIn' | 'replied' | 'hired'>[]
  ): MessageTemplate[] {
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

  templatesApi(): TemplatesApi {
    const repo = this.templateRepo
    const one = (id: string): MessageTemplate => this.withTemplateStats([repo.getOrThrow(id)])[0]
    return {
      list: async (query) => {
        const q = z
          .object({
            situation: z.enum(TEMPLATE_SITUATIONS).optional(),
            search: z.string().max(200).optional(),
            tagId: idArg.optional()
          })
          .parse(query ?? {})
        return this.withTemplateStats(
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
            [
              asc(messageTemplates.situation),
              desc(messageTemplates.copyCount),
              desc(messageTemplates.updatedAt)
            ],
            pageSchema.parse(query ?? {}).limit,
            pageSchema.parse(query ?? {}).offset
          )
        )
      },
      get: async (id) => {
        const t = repo.get(idArg.parse(id))
        return t ? this.withTemplateStats([t])[0] : null
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

  /* ───────── portfolio cases & red flags ───────── */

  casesApi(): CasesApi {
    const repo = this.caseRepo
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
        const stored = await this.m.files.import(source, { imagesOnly: true })
        const updated = repo.patch(id, { coverPath: stored.path })
        this.m.files.remove(current.coverPath)
        return updated
      }
    }
  }

  redFlagsApi(): RedFlagsApi {
    const repo = this.flagRepo
    return createCrudApi<RedFlagRow, RedFlag, RedFlagInput, RedFlagPatch, { search?: string }>({
      repo,
      input: redFlagInputSchema,
      patch: redFlagPatchSchema,
      query: z.object({ search: z.string().max(200).optional() }),
      where: (q) => [repo.matches(q.search, [redFlags.title, redFlags.signs, redFlags.action])],
      orderBy: [desc(redFlags.severity), asc(redFlags.title)]
    })
  }

  /* ───────── statistics ───────── */

  private funnel(key: string, label: string, rows: ProposalRow[]): FunnelRow {
    const sent = rows.filter((r) => r.status !== 'draft')
    const replied = sent.filter(
      (r) => r.repliedAt !== null || (RANK[r.status as ProposalStatus] ?? 0) >= 3
    ).length
    const interview = sent.filter(
      (r) => (RANK[r.status as ProposalStatus] ?? 0) >= 4 || r.hiredAt !== null
    ).length
    const hired = sent.filter((r) => r.status === 'hired' || r.hiredAt !== null).length
    return {
      key,
      label,
      sent: sent.length,
      replied,
      interview,
      hired,
      replyRate: pct(replied, sent.length),
      hireRate: pct(hired, sent.length),
      credits: sent.reduce((s, r) => s + r.credits + r.boostCredits, 0)
    }
  }

  stats(query: z.input<typeof statsQuerySchema>): FreelanceStats {
    const q = statsQuerySchema.parse(query ?? {})
    const to = q.to ?? now()
    const from = q.from ?? startOfDay(to) - 89 * DAY_MS
    const rows = this.db
      .select()
      .from(proposals)
      .where(
        and(
          isNull(proposals.deletedAt),
          q.platformId ? eq(proposals.platformId, q.platformId) : undefined,
          gte(sql`coalesce(${proposals.sentAt}, ${proposals.createdAt})`, from),
          lte(sql`coalesce(${proposals.sentAt}, ${proposals.createdAt})`, to)
        )
      )
      .all()
    const group = (
      keyOf: (r: ProposalRow) => string,
      labelOf: (k: string) => string
    ): FunnelRow[] => {
      const map = new Map<string, ProposalRow[]>()
      for (const r of rows) map.set(keyOf(r), [...(map.get(keyOf(r)) ?? []), r])
      return [...map.entries()]
        .map(([k, list]) => this.funnel(k, labelOf(k), list))
        .filter((f) => f.sent > 0)
        .sort((a, b) => b.sent - a.sent)
    }
    const templateTitles = new Map(
      this.db
        .select({ id: messageTemplates.id, title: messageTemplates.title })
        .from(messageTemplates)
        .all()
        .map((t) => [t.id, t.title])
    )
    const platformNames = new Map(
      this.db
        .select({ id: platforms.id, name: platforms.name })
        .from(platforms)
        .all()
        .map((p) => [p.id, p.name])
    )

    const weeks = new Map<number, { sent: number; replied: number; hired: number }>()
    for (let w = startOfWeek(from); w <= to; w += 7 * DAY_MS)
      weeks.set(w, { sent: 0, replied: 0, hired: 0 })
    for (const r of rows) {
      if (r.status === 'draft') continue
      const w = startOfWeek(r.sentAt ?? r.createdAt)
      const b = weeks.get(w)
      if (!b) continue
      b.sent++
      if (r.repliedAt) b.replied++
      if (r.hiredAt) b.hired++
    }
    const replyTimes = rows
      .filter((r) => r.repliedAt && r.sentAt)
      .map((r) => (r.repliedAt! - r.sentAt!) / 3600_000)
    return {
      range: { from, to },
      totals: this.funnel('all', 'Все', rows),
      byNiche: group(
        (r) => r.niche || '—',
        (k) => (k === '—' ? 'Без типа' : k)
      ),
      byTemplate: group(
        (r) => r.templateId ?? '—',
        (k) => (k === '—' ? 'Без шаблона' : (templateTitles.get(k) ?? 'Удалённый шаблон'))
      ),
      byPlatform: group(
        (r) => r.platformId,
        (k) => platformNames.get(k) ?? '—'
      ),
      weekly: [...weeks.entries()].map(([w, v]) => ({
        week: new Date(w).toISOString().slice(0, 10),
        ...v
      })),
      avgReplyHours: replyTimes.length
        ? Math.round((replyTimes.reduce((s, x) => s + x, 0) / replyTimes.length) * 10) / 10
        : null
    }
  }

  freelanceApi(): FreelanceApi {
    return { stats: async (query) => this.stats(query ?? {}) }
  }

  /* ───────── goals ───────── */

  private periodRange(period: GoalPeriod, at = now()): [number, number] {
    if (period === 'week') return [startOfWeek(at), startOfWeek(at) + 7 * DAY_MS - 1]
    const start = startOfMonth(at)
    const d = new Date(start)
    return [start, new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1]
  }

  /** Net paid (after platform fee) in range, in the main currency of the platforms involved. */
  private netIncome(from: number, to: number, platformId: string | null): number {
    const rows = this.db
      .select({
        amount: payments.amount,
        fee: projects.feePercent,
        platformFee: platforms.defaultFeePercent
      })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .leftJoin(platforms, eq(platforms.id, projects.platformId))
      .where(
        and(
          isNull(projects.deletedAt),
          eq(payments.status, 'paid'),
          gte(payments.paidAt, from),
          lte(payments.paidAt, to),
          platformId ? eq(projects.platformId, platformId) : undefined
        )
      )
      .all()
    return (
      Math.round(
        rows.reduce((s, r) => s + r.amount * (1 - (r.fee ?? r.platformFee ?? 0) / 100), 0) * 100
      ) / 100
    )
  }

  private metricValue(
    metric: GoalMetric,
    from: number,
    to: number,
    platformId: string | null
  ): number {
    if (metric === 'net_income') return this.netIncome(from, to, platformId)
    const f = this.stats({ from, to, platformId: platformId ?? undefined }).totals
    switch (metric) {
      case 'proposals':
        return f.sent
      case 'replies':
        return f.replied
      case 'contracts':
        return f.hired
      case 'reply_rate':
        return f.replyRate
      case 'hire_rate':
        return f.hireRate
    }
  }

  goalsApi(): GoalsApi {
    const toGoal = (r: typeof goals.$inferSelect): Goal => ({
      ...r,
      metric: r.metric as GoalMetric,
      period: r.period as GoalPeriod
    })
    return {
      list: async () =>
        this.db.select().from(goals).orderBy(asc(goals.createdAt)).all().map(toGoal),
      progress: async (args) => {
        const { platformId } = z.object({ platformId: idArg.optional() }).parse(args ?? {})
        return this.db
          .select()
          .from(goals)
          .where(eq(goals.active, true))
          .all()
          .map(toGoal)
          .filter((g) => !platformId || g.platformId === null || g.platformId === platformId)
          .map((g): GoalProgress => {
            const [periodStart, periodEnd] = this.periodRange(g.period)
            const current = this.metricValue(g.metric, periodStart, periodEnd, g.platformId)
            return {
              ...g,
              current,
              ratio: g.target ? Math.min(1, current / g.target) : 0,
              periodStart,
              periodEnd
            }
          })
      },
      create: async (input) => {
        const data = goalInputSchema.parse(input)
        const row = this.db
          .insert(goals)
          .values({ ...data, id: newId(), createdAt: now() })
          .returning()
          .get()
        return toGoal(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(goalPatchSchema).parse(args)
        const row = this.db.update(goals).set(patch).where(eq(goals.id, id)).returning().get()
        if (!row) throw new NotFoundError('Цель', id)
        return toGoal(row)
      },
      remove: async (id) => {
        this.db
          .delete(goals)
          .where(eq(goals.id, idArg.parse(id)))
          .run()
      }
    }
  }

  /** Clients marked "не работать" — shown as warnings in proposals. */
  avoidedClientNames(): string[] {
    return this.db
      .select({ name: clients.name })
      .from(clients)
      .where(and(isNull(clients.deletedAt), eq(clients.status, 'avoid')))
      .all()
      .map((c) => c.name)
  }
}

export { BID_TYPES, PROPOSAL_STATUSES }
