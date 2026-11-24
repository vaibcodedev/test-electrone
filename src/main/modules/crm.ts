/**
 * Clients & projects: contacts, encrypted credentials, time tracking, payments and money math.
 * Money is always computed per project currency; overview groups by currency (no FX conversion).
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import type { ClientsApi, CredentialsApi, PaymentsApi, ProjectsApi, TimeApi } from '@shared/api'
import {
  clientListQuerySchema,
  clientInputSchema,
  clientPatchSchema,
  credentialInputSchema,
  credentialPatchSchema,
  paymentInputSchema,
  paymentPatchSchema,
  projectInputSchema,
  projectListQuerySchema,
  projectPatchSchema,
  timeEntryInputSchema,
  timeEntryPatchSchema,
  type BillingType,
  type Client,
  type ClientStatus,
  type ClientSummary,
  type CrmOverview,
  type Credential,
  type Currency,
  type Payment,
  type PaymentStatus,
  type Project,
  type ProjectStatus,
  type ProjectSummary,
  type RunningTimer,
  type TimeEntry
} from '@shared/domain/crm'
import { pageSchema } from '@shared/domain/common'
import { clients, credentials, payments, platforms, projects, timeEntries } from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { newId, now, NotFoundError, startOfMonth, startOfWeek, UserError, overlapMinutes } from '../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'

type ClientRow = typeof clients.$inferSelect
type ProjectRow = typeof projects.$inferSelect
type PaymentRow = typeof payments.$inferSelect
type TimeRow = typeof timeEntries.$inferSelect
type CredentialRow = typeof credentials.$inferSelect

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: 'Лід',
  active: 'У роботі',
  paused: 'На паузі',
  done: 'Завершено',
  cancelled: 'Скасовано'
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Months a retainer has been billed: every started calendar month from start until due/now. */
export function monthsBilled(
  start: number,
  due: number | null,
  status: string,
  at = Date.now()
): number {
  if (status === 'lead') return 0
  const end = Math.min(at, due ?? at)
  if (end < start) return 0
  const a = new Date(start)
  const b = new Date(end)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
}

const minutesBetween = (a: number, b: number): number => Math.max(0, Math.round((b - a) / 60_000))

export class CrmModule {
  readonly descriptors: EntityDescriptor[]
  readonly clientRepo: SoftRepository<ClientRow, Client>
  readonly projectRepo: SoftRepository<ProjectRow, Project>

  constructor(private readonly m: ModuleContext) {
    const client: EntityDescriptor = {
      type: 'client',
      table: clients,
      searchDoc: (r) => ({
        title: r.name,
        body: `${r.company}\n${r.email}\n${r.phone}\n${r.messenger}\n${r.website}\n${r.notes}`
      }),
      summary: (r) => ({ title: r.name, subtitle: r.company || undefined })
    }
    const project: EntityDescriptor = {
      type: 'project',
      table: projects,
      searchDoc: (r) => ({
        title: r.title,
        body: `${r.description}\n${r.repoUrl}\n${r.stagingUrl}\n${r.prodUrl}`
      }),
      summary: (r) => ({
        title: r.title,
        subtitle: PROJECT_STATUS_LABEL[r.status as ProjectStatus]
      })
    }
    this.descriptors = [client, project]
    this.clientRepo = new SoftRepository(m.repo, client, (r, tags) => ({
      ...r,
      status: r.status as ClientStatus,
      currency: r.currency as Currency,
      defaultBilling: r.defaultBilling as BillingType,
      tags
    }))
    this.projectRepo = new SoftRepository(m.repo, project, (r, tags) => ({
      ...r,
      status: r.status as ProjectStatus,
      billing: r.billing as BillingType,
      currency: r.currency as Currency,
      tags
    }))
  }

  private get db() {
    return this.m.db.orm
  }

  /* ───────── money math ───────── */

  private toPayment(r: PaymentRow): Payment {
    const open = r.status === 'expected' || r.status === 'invoiced'
    return {
      ...r,
      currency: r.currency as Currency,
      status: r.status as PaymentStatus,
      overdue: open && r.dueAt !== null && r.dueAt < now()
    }
  }

  private toTime(r: TimeRow): TimeEntry {
    return { ...r, minutes: r.endedAt ? r.minutes : minutesBetween(r.startedAt, now()) }
  }

  private summarizeProjects(list: Project[]): ProjectSummary[] {
    if (!list.length) return []
    const ids = list.map((p) => p.id)
    const times = this.db
      .select()
      .from(timeEntries)
      .where(inArray(timeEntries.projectId, ids))
      .all()
    const pays = this.db.select().from(payments).where(inArray(payments.projectId, ids)).all()
    const clientIds = [...new Set(list.map((p) => p.clientId).filter((x): x is string => !!x))]
    const clientNames = new Map(
      clientIds.length
        ? this.db
            .select({ id: clients.id, name: clients.name })
            .from(clients)
            .where(inArray(clients.id, clientIds))
            .all()
            .map((c) => [c.id, c.name])
        : []
    )
    const platformRows = this.db
      .select({ id: platforms.id, name: platforms.name, fee: platforms.defaultFeePercent })
      .from(platforms)
      .all()
    const platformById = new Map(platformRows.map((x) => [x.id, x]))
    return list.map((p) => {
      const platform = p.platformId ? platformById.get(p.platformId) : undefined
      const effectiveFeePercent = p.feePercent ?? platform?.fee ?? 0
      const mine = times.filter((t) => t.projectId === p.id).map((t) => this.toTime(t))
      const trackedMinutes = mine.reduce((s, t) => s + t.minutes, 0)
      const billableMinutes = mine.filter((t) => t.billable).reduce((s, t) => s + t.minutes, 0)
      const myPays = pays.filter((x) => x.projectId === p.id && x.currency === p.currency)
      const paidAmount = myPays.filter((x) => x.status === 'paid').reduce((s, x) => s + x.amount, 0)
      const openAmount = myPays
        .filter((x) => x.status === 'expected' || x.status === 'invoiced')
        .reduce((s, x) => s + x.amount, 0)
      const retainerMonths =
        p.billing === 'retainer' ? monthsBilled(p.startAt ?? p.createdAt, p.dueAt, p.status) : 0
      const earnedAmount = round2(
        p.billing === 'hourly'
          ? (billableMinutes / 60) * p.rate
          : p.billing === 'fixed'
            ? p.fixedPrice
            : p.billing === 'retainer'
              ? p.fixedPrice * retainerMonths
              : 0
      )
      const outstandingAmount =
        p.billing === 'none'
          ? 0
          : Math.max(0, round2(earnedAmount - paidAmount), round2(openAmount))
      const effectiveRate =
        trackedMinutes >= 30 && earnedAmount > 0
          ? round2(earnedAmount / (trackedMinutes / 60))
          : null
      return {
        ...p,
        clientName: p.clientId ? (clientNames.get(p.clientId) ?? null) : null,
        platformName: platform?.name ?? null,
        effectiveFeePercent,
        netPaidAmount: round2(paidAmount * (1 - effectiveFeePercent / 100)),
        trackedMinutes,
        earnedAmount,
        effectiveRate,
        retainerMonths,
        paidAmount,
        outstandingAmount
      }
    })
  }

  private summarizeClients(list: Client[]): ClientSummary[] {
    if (!list.length) return []
    const projectsOf = this.summarizeProjects(
      this.projectRepo.listWhere([
        inArray(
          projects.clientId,
          list.map((c) => c.id)
        )
      ])
    )
    return list.map((c) => {
      const mine = projectsOf.filter((p) => p.clientId === c.id)
      const sameCur = mine.filter((p) => p.currency === c.currency)
      return {
        ...c,
        projectCount: mine.length,
        activeProjectCount: mine.filter((p) => p.status === 'active').length,
        trackedMinutes: mine.reduce((s, p) => s + p.trackedMinutes, 0),
        paidTotal: sameCur.reduce((s, p) => s + p.paidAmount, 0),
        outstandingTotal: sameCur.reduce((s, p) => s + p.outstandingAmount, 0)
      }
    })
  }

  private toCredential(r: CredentialRow): Credential {
    return {
      id: r.id,
      projectId: r.projectId,
      clientId: r.clientId,
      label: r.label,
      url: r.url,
      login: r.login,
      hasSecret: !!r.secret,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  }

  private credentialsFor(where: { projectIds?: string[]; clientId?: string }): Credential[] {
    const conds = [
      where.projectIds?.length ? inArray(credentials.projectId, where.projectIds) : undefined,
      where.clientId ? eq(credentials.clientId, where.clientId) : undefined
    ].filter(Boolean)
    if (!conds.length) return []
    return this.db
      .select()
      .from(credentials)
      .where(or(...conds))
      .orderBy(asc(credentials.label))
      .all()
      .map((r) => this.toCredential(r))
  }

  /* ───────── running timer ───────── */

  /** Active projects, most recently touched first — the tray's «start timer» list. */
  recentActiveProjects(limit = 6): { id: string; title: string }[] {
    return this.db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.status, 'active')))
      .orderBy(desc(projects.updatedAt))
      .limit(limit)
      .all()
  }

  running(): RunningTimer | null {
    const row = this.db
      .select({ entry: timeEntries, projectTitle: projects.title })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(and(isNull(timeEntries.endedAt), isNull(projects.deletedAt)))
      .orderBy(desc(timeEntries.startedAt))
      .get()
    return row ? { ...this.toTime(row.entry), projectTitle: row.projectTitle } : null
  }

  stopRunning(): TimeEntry | null {
    const run = this.db.select().from(timeEntries).where(isNull(timeEntries.endedAt)).all()
    let last: TimeEntry | null = null
    const ts = now()
    for (const r of run) {
      // Under a minute = an accidental start/stop: don't keep a «0 хв» entry.
      if (ts - r.startedAt < 60_000) {
        this.db.delete(timeEntries).where(eq(timeEntries.id, r.id)).run()
        continue
      }
      const updated = this.db
        .update(timeEntries)
        .set({ endedAt: ts, minutes: minutesBetween(r.startedAt, ts) })
        .where(eq(timeEntries.id, r.id))
        .returning()
        .get()
      last = this.toTime(updated!)
    }
    return last
  }

  /** Minutes worked inside [from, to]: entries crossing midnight / week boundaries count only their part. */
  minutesInRange(from: number, to: number): number {
    const at = now()
    // Projects in the trash don't count (running() already hides them).
    return this.db
      .select({ startedAt: timeEntries.startedAt, endedAt: timeEntries.endedAt, minutes: timeEntries.minutes })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(
        and(
          isNull(projects.deletedAt),
          lte(timeEntries.startedAt, to),
          or(isNull(timeEntries.endedAt), gte(timeEntries.endedAt, from))
        )
      )
      .all()
      .reduce((s, t) => s + overlapMinutes(t, from, to, at), 0)
  }

  /* ───────── APIs ───────── */

  clientsApi(): ClientsApi {
    const repo = this.clientRepo
    const one = (id: string): ClientSummary => {
      const c = this.summarizeClients([repo.getOrThrow(id)])[0]
      return c
    }
    return {
      list: async (query) => {
        const q = clientListQuerySchema.extend(pageSchema.shape).parse(query ?? {})
        return this.summarizeClients(
          repo.listWhere(
            [
              repo.matches(q.search, [clients.name, clients.company, clients.email, clients.country]),
              q.platformId === 'direct' ? isNull(clients.platformId) : q.platformId ? eq(clients.platformId, q.platformId) : undefined
            ],
            [asc(clients.status), asc(clients.name)],
            q.limit,
            q.offset
          )
        )
      },
      get: async (id) => {
        const c = repo.get(idArg.parse(id))
        return c ? this.summarizeClients([c])[0] : null
      },
      create: async (input) => {
        const [data, tagIds] = splitTags(clientInputSchema.parse(input))
        return one(repo.insert(data, tagIds).id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(clientPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        repo.patch(id, data, tagIds)
        return one(id)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      details: async (id) => {
        const c = repo.get(idArg.parse(id))
        if (!c) return null
        const projectList = this.summarizeProjects(
          this.projectRepo.listWhere([eq(projects.clientId, c.id)])
        )
        return {
          client: this.summarizeClients([c])[0],
          projects: projectList,
          credentials: this.credentialsFor({ clientId: c.id })
        }
      }
    }
  }

  projectsApi(): ProjectsApi {
    const repo = this.projectRepo
    const one = (id: string): ProjectSummary => this.summarizeProjects([repo.getOrThrow(id)])[0]
    return {
      list: async (query) => {
        const q = projectListQuerySchema.extend(pageSchema.shape).parse(query ?? {})
        return this.summarizeProjects(
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
        return p ? this.summarizeProjects([p])[0] : null
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
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      details: async (id) => {
        const p = repo.get(idArg.parse(id))
        if (!p) return null
        const project = this.summarizeProjects([p])[0]
        return {
          project,
          client: p.clientId ? this.clientRepo.get(p.clientId) : null,
          timeEntries: this.db
            .select()
            .from(timeEntries)
            .where(eq(timeEntries.projectId, p.id))
            .orderBy(desc(timeEntries.startedAt))
            .all()
            .map((t) => this.toTime(t)),
          payments: this.db
            .select()
            .from(payments)
            .where(eq(payments.projectId, p.id))
            .orderBy(desc(payments.createdAt))
            .all()
            .map((x) => this.toPayment(x)),
          credentials: this.credentialsFor({ projectIds: [p.id] })
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
          .map((r) => this.toPayment(r.pay))
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
          monthMinutes: this.minutesInRange(monthStart, ts),
          weekMinutes: this.minutesInRange(startOfWeek(ts), ts),
          paidThisMonth,
          outstanding,
          activeProjects: repo.listWhere([eq(projects.status, 'active')]).length,
          overduePayments: allPays.filter((p) => p.overdue).length
        }
      }
    }
  }

  credentialsApi(): CredentialsApi {
    const find = (id: string): CredentialRow => {
      const row = this.db.select().from(credentials).where(eq(credentials.id, id)).get()
      if (!row) throw new NotFoundError('Доступ', id)
      return row
    }
    return {
      list: async (args) => {
        const { projectId, clientId } = z
          .object({ projectId: idArg.optional(), clientId: idArg.optional() })
          .parse(args ?? {})
        return this.credentialsFor({ projectIds: projectId ? [projectId] : undefined, clientId })
      },
      create: async (input) => {
        const data = credentialInputSchema.parse(input)
        if (!data.projectId && !data.clientId)
          throw new UserError('Доступ має належати клієнту або проєкту')
        const ts = now()
        const row = this.db
          .insert(credentials)
          .values({
            ...data,
            id: newId(),
            secret: this.m.secrets.encrypt(data.secret),
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
        return this.toCredential(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(credentialPatchSchema).parse(args)
        find(id)
        const values = {
          ...patch,
          ...(patch.secret !== undefined ? { secret: this.m.secrets.encrypt(patch.secret) } : {}),
          updatedAt: now()
        }
        const row = this.db
          .update(credentials)
          .set(values)
          .where(eq(credentials.id, id))
          .returning()
          .get()
        return this.toCredential(row!)
      },
      remove: async (id) => {
        this.db
          .delete(credentials)
          .where(eq(credentials.id, idArg.parse(id)))
          .run()
      },
      reveal: async (id) => this.m.secrets.decrypt(find(idArg.parse(id)).secret)
    }
  }

  timeApi(): TimeApi {
    const find = (id: string): TimeRow => {
      const row = this.db.select().from(timeEntries).where(eq(timeEntries.id, id)).get()
      if (!row) throw new NotFoundError('Запис часу', id)
      return row
    }
    return {
      list: async (args) => {
        const q = z
          .object({
            projectId: idArg.optional(),
            from: z.number().optional(),
            to: z.number().optional()
          })
          .parse(args ?? {})
        return this.db
          .select()
          .from(timeEntries)
          .where(
            and(
              q.projectId ? eq(timeEntries.projectId, q.projectId) : undefined,
              q.from !== undefined ? gte(timeEntries.startedAt, q.from) : undefined,
              q.to !== undefined ? lte(timeEntries.startedAt, q.to) : undefined
            )
          )
          .orderBy(desc(timeEntries.startedAt))
          .all()
          .map((t) => this.toTime(t))
      },
      running: async () => this.running(),
      start: async (args) => {
        const { projectId, description } = z
          .object({ projectId: idArg, description: z.string().max(2000).optional() })
          .parse(args)
        this.projectRepo.rowOrThrow(projectId)
        this.m.db.tx(() => {
          this.stopRunning()
          this.db
            .insert(timeEntries)
            .values({
              id: newId(),
              projectId,
              description: description ?? '',
              startedAt: now(),
              endedAt: null,
              minutes: 0,
              billable: true,
              createdAt: now()
            })
            .run()
        })
        this.m.bus.dataChanged(['project'])
        return this.running()!
      },
      stop: async () => {
        const entry = this.stopRunning()
        this.m.bus.dataChanged(['project'])
        return entry
      },
      create: async (input) => {
        const data = timeEntryInputSchema.parse(input)
        this.projectRepo.rowOrThrow(data.projectId)
        const endedAt = data.endedAt ?? data.startedAt
        if (endedAt < data.startedAt) throw new UserError('Кінець раніше за початок')
        const row = this.db
          .insert(timeEntries)
          .values({
            ...data,
            id: newId(),
            endedAt,
            minutes: minutesBetween(data.startedAt, endedAt),
            createdAt: now()
          })
          .returning()
          .get()
        return this.toTime(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(timeEntryPatchSchema).parse(args)
        const cur = find(id)
        const startedAt = patch.startedAt ?? cur.startedAt
        const endedAt = patch.endedAt !== undefined ? patch.endedAt : cur.endedAt
        if (endedAt !== null && endedAt < startedAt) throw new UserError('Кінець раніше за початок')
        const row = this.db
          .update(timeEntries)
          .set({ ...patch, minutes: endedAt ? minutesBetween(startedAt, endedAt) : 0 })
          .where(eq(timeEntries.id, id))
          .returning()
          .get()
        return this.toTime(row!)
      },
      remove: async (id) => {
        this.db
          .delete(timeEntries)
          .where(eq(timeEntries.id, idArg.parse(id)))
          .run()
      }
    }
  }

  paymentsApi(): PaymentsApi {
    return {
      list: async (args) => {
        const { projectId } = z.object({ projectId: idArg.optional() }).parse(args ?? {})
        return this.db
          .select({ pay: payments })
          .from(payments)
          .innerJoin(projects, eq(projects.id, payments.projectId))
          .where(
            and(
              isNull(projects.deletedAt),
              projectId ? eq(payments.projectId, projectId) : undefined
            )
          )
          .orderBy(desc(payments.createdAt))
          .all()
          .map((r) => this.toPayment(r.pay))
      },
      create: async (input) => {
        const data = paymentInputSchema.parse(input)
        const project = this.projectRepo.rowOrThrow(data.projectId)
        this.assertWithinPrice(project, data.amount, data.currency)
        const row = this.db
          .insert(payments)
          .values({
            ...data,
            id: newId(),
            paidAt: data.status === 'paid' ? (data.paidAt ?? now()) : data.paidAt,
            createdAt: now()
          })
          .returning()
          .get()
        return this.toPayment(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(paymentPatchSchema).parse(args)
        const cur = this.db.select().from(payments).where(eq(payments.id, id)).get()
        if (!cur) throw new NotFoundError('Оплата', id)
        if (patch.amount !== undefined || patch.currency !== undefined) {
          this.assertWithinPrice(
            this.projectRepo.rowOrThrow(cur.projectId),
            patch.amount ?? cur.amount,
            patch.currency ?? cur.currency,
            id
          )
        }
        const values = { ...patch }
        if (patch.status === 'paid' && !cur.paidAt && patch.paidAt === undefined)
          values.paidAt = now()
        if (patch.status && patch.status !== 'paid' && patch.paidAt === undefined)
          values.paidAt = null
        const row = this.db
          .update(payments)
          .set(values)
          .where(eq(payments.id, id))
          .returning()
          .get()
        return this.toPayment(row!)
      },
      remove: async (id) => {
        this.db
          .delete(payments)
          .where(eq(payments.id, idArg.parse(id)))
          .run()
      }
    }
  }

  /**
   * Fixed-price project: stages can't add up to more than the price (same currency).
   * Otherwise "left to receive" and income stats would be nonsense (5 000 $ project, 5 000 000 $ stage).
   */
  private assertWithinPrice(project: { billing: string; fixedPrice: number; currency: string }, amount: number, currency: string, exceptId?: string): void {
    if (project.billing !== 'fixed' || project.fixedPrice <= 0) return
    if (currency !== project.currency)
      throw new Error(`Етапи фіксованого проєкту — у валюті проєкту (${project.currency}).`)
    const others = this.db
      .select({ id: payments.id, amount: payments.amount, currency: payments.currency, status: payments.status })
      .from(payments)
      .where(eq(payments.projectId, (project as { id?: string }).id ?? ''))
      .all()
      // Cancelled stages free their share (the UI counts «не розподілено» the same way).
      .filter((p) => p.id !== exceptId && p.currency === currency && p.status !== 'cancelled')
      .reduce((sum, p) => sum + p.amount, 0)
    const left = Math.round((project.fixedPrice - others) * 100) / 100
    if (amount > left + 0.005) {
      const fmt = (n: number): string => `${n.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ${currency}`
      throw new Error(
        left > 0
          ? `Етапи перевищують вартість проєкту (${fmt(project.fixedPrice)}): можна додати щонайбільше ${fmt(left)}. Змініть суму або вартість проєкту.`
          : `Вартість проєкту (${fmt(project.fixedPrice)}) вже повністю розподілена між етапами. Збільште вартість проєкту, щоб додати етап.`
      )
    }
  }

  /** Payments with a due date in range (for the calendar). */
  paymentsDue(from: number, to: number): (Payment & { projectTitle: string })[] {
    return this.db
      .select({ pay: payments, projectTitle: projects.title })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .where(
        and(
          isNull(projects.deletedAt),
          isNotNull(payments.dueAt),
          gte(payments.dueAt, from),
          lte(payments.dueAt, to)
        )
      )
      .all()
      .map((r) => ({ ...this.toPayment(r.pay), projectTitle: r.projectTitle }))
  }
}
