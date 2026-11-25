import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ProposalsApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import { fieldMax, MAX } from '@shared/domain/limits'
import { clientInputSchema, projectInputSchema } from '@shared/domain/crm'
import {
  hireSchema,
  proposalInputSchema,
  proposalListQuerySchema,
  proposalPatchSchema,
  type ProposalStatus
} from '@shared/domain/freelance'
import { proposals } from '../../db/schema'
import type { Orm } from '../../db/client'
import { DAY_MS, defined, now, UserError } from '../../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from '../context'
import type { CrmModule } from '../crm'
import type { Platforms } from './platforms'
import type { Templates } from './templates'
import { REPLIED_STATUSES, type ProposalRepo, type ProposalRow } from './shared'

const PROJECT_RATE_MAX = fieldMax(projectInputSchema.shape.rate)
const PROJECT_PRICE_MAX = fieldMax(projectInputSchema.shape.fixedPrice)
const CLIENT_RATE_MAX = fieldMax(clientInputSchema.shape.defaultRate)

/** The proposals pipeline: statuses with stamps, stale ones, hire → CRM contract, save as a template. */
export class Proposals {
  constructor(
    private readonly m: ModuleContext,
    private readonly repo: ProposalRepo,
    private readonly platforms: Platforms,
    private readonly templates: Templates,
    private readonly crm: CrmModule
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

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

  api(): ProposalsApi {
    const repo = this.repo
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
        this.platforms.get(data.platformId)
        const stamps = this.stamps(data.status)
        return repo.insert(
          {
            ...data,
            repliedAt: null,
            hiredAt: null,
            projectId: null,
            ...stamps,
            // An explicitly passed date wins over the automatic "now" stamp.
            sentAt: data.sentAt ?? stamps.sentAt ?? null
          },
          tagIds
        )
      },
      update: async (args) => {
        const { id, patch } = updateArgs(proposalPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        const current = repo.rowOrThrow(id)
        // Automatic stamps only fill what the caller did not pass explicitly.
        return repo.patch(id, { ...this.stamps(data.status, current), ...defined(data) }, tagIds)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      niches: async () =>
        this.db
          .selectDistinct({ niche: proposals.niche })
          .from(proposals)
          .where(and(isNull(proposals.deletedAt), sql`${proposals.niche} != ''`))
          .all()
          .map((r) => r.niche)
          .sort((a, b) => a.localeCompare(b, 'uk')),
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
        const platform = this.platforms.get(p.platformId)
        if (data.clientId) this.crm.clientRepo.rowOrThrow(data.clientId)
        const ids = this.m.db.tx(() => {
          // A double click or a retry after an error must not create a second contract (and client).
          const current = repo.rowOrThrow(p.id)
          if (current.projectId && this.crm.projectRepo.row(current.projectId)) {
            throw new UserError('Цей відгук уже перетворено на контракт')
          }
          let clientId = data.clientId ?? p.clientId
          if (!clientId) {
            const created = this.crm.clientRepo.insert({
              name: p.clientName || 'Клієнт',
              company: '',
              email: '',
              phone: '',
              messenger: '',
              website: '',
              notes: '',
              status: 'active',
              currency: platform.currency,
              defaultBilling: data.billing,
              defaultRate: data.billing === 'hourly' ? Math.min(data.amount, CLIENT_RATE_MAX) : 0,
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
            // The repo insert skips the schema: keep the values inside its ranges (hire allows 100M).
            rate: data.billing === 'hourly' ? Math.min(data.amount, PROJECT_RATE_MAX) : 0,
            fixedPrice: data.billing === 'fixed' ? Math.min(data.amount, PROJECT_PRICE_MAX) : 0,
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
        if (!p.coverLetter.trim()) throw new UserError('У відгуку немає тексту')
        const t = this.templates.repo.insert({
          situation: 'proposal',
          title: p.niche ? `${p.niche}: ${p.jobTitle}`.slice(0, MAX.title) : p.jobTitle.slice(0, MAX.title),
          trigger: '',
          body: p.coverLetter,
          note: '',
          niche: p.niche,
          copyCount: 0
        })
        return this.templates.withStats([t])[0]
      }
    }
  }
}
