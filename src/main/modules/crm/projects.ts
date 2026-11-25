import { desc, eq, isNull } from 'drizzle-orm'
import type { ProjectsApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import {
  projectInputSchema,
  projectListQuerySchema,
  projectPatchSchema,
  type CrmOverview,
  type Currency,
  type ProjectSummary
} from '@shared/domain/crm'
import { payments, projects, timeEntries } from '../../db/schema'
import type { Orm } from '../../db/client'
import { now, startOfMonth, startOfWeek } from '../../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from '../context'
import type { Credentials } from './credentials'
import type { CrmSummaries } from './summaries'
import type { TimeTracker } from './time'
import { toPayment, toTime, type ClientRepo, type ProjectRepo } from './shared'

/** Projects with their time, payments and logins; the CRM overview (this month, outstanding, overdue). */
export class Projects {
  constructor(
    private readonly m: ModuleContext,
    private readonly repo: ProjectRepo,
    private readonly clientRepo: ClientRepo,
    private readonly summaries: CrmSummaries,
    private readonly credentials: Credentials,
    private readonly time: TimeTracker
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  api(): ProjectsApi {
    const repo = this.repo
    const one = (id: string): ProjectSummary => this.summaries.projects([repo.getOrThrow(id)])[0]
    return {
      list: async (query) => {
        const q = projectListQuerySchema.extend(pageSchema.shape).parse(query ?? {})
        return this.summaries.projects(
          repo.listWhere(
            [
              q.clientId ? eq(projects.clientId, q.clientId) : undefined,
              q.status ? eq(projects.status, q.status) : undefined,
              q.platformId === 'direct' ? isNull(projects.platformId) : q.platformId ? eq(projects.platformId, q.platformId) : undefined,
              repo.hasTag(q.tagId),
              repo.matches(q.search, [projects.title, projects.description])
            ],
            undefined,
            q.limit,
            q.offset
          )
        )
      },
      get: async (id) => {
        const p = repo.get(idArg.parse(id))
        return p ? this.summaries.projects([p])[0] : null
      },
      create: async (input) => {
        const [data, tagIds] = splitTags(projectInputSchema.parse(input))
        if (data.clientId) this.clientRepo.rowOrThrow(data.clientId)
        return one(repo.insert({ ...data, proposalId: null }, tagIds).id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(projectPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        repo.patch(id, data, tagIds)
        return one(id)
      },
      remove: async (id) => {
        const pid = idArg.parse(id)
        this.m.db.tx(() => {
          this.time.stopRunningOf(pid)
          repo.softDelete(pid)
        })
      },
      details: async (id) => {
        const p = repo.get(idArg.parse(id))
        if (!p) return null
        const project = this.summaries.projects([p])[0]
        return {
          project,
          client: p.clientId ? this.clientRepo.get(p.clientId) : null,
          timeEntries: this.db
            .select()
            .from(timeEntries)
            .where(eq(timeEntries.projectId, p.id))
            .orderBy(desc(timeEntries.startedAt))
            .all()
            .map(toTime),
          payments: this.db
            .select()
            .from(payments)
            .where(eq(payments.projectId, p.id))
            .orderBy(desc(payments.createdAt))
            .all()
            .map(toPayment),
          credentials: this.credentials.forOwner({ projectIds: [p.id] })
        }
      },
      overview: async (): Promise<CrmOverview> => {
        const ts = now()
        const monthStart = startOfMonth(ts)
        const allPays = this.db
          .select({ pay: payments })
          .from(payments)
          .innerJoin(projects, eq(projects.id, payments.projectId))
          .where(isNull(projects.deletedAt))
          .all()
          .map((r) => toPayment(r.pay))
        const paidThisMonth: Partial<Record<Currency, number>> = {}
        const outstanding: Partial<Record<Currency, number>> = {}
        for (const p of allPays) {
          if (p.status === 'paid' && p.paidAt && p.paidAt >= monthStart) {
            paidThisMonth[p.currency] = (paidThisMonth[p.currency] ?? 0) + p.amount
          }
          if (p.status === 'expected' || p.status === 'invoiced') {
            outstanding[p.currency] = (outstanding[p.currency] ?? 0) + p.amount
          }
        }
        return {
          monthMinutes: this.time.minutesInRange(monthStart, ts),
          weekMinutes: this.time.minutesInRange(startOfWeek(ts), ts),
          paidThisMonth,
          outstanding,
          activeProjects: repo.listWhere([eq(projects.status, 'active')]).length,
          overduePayments: allPays.filter((p) => p.overdue).length
        }
      }
    }
  }
}
