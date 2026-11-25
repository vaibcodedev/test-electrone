import { inArray } from 'drizzle-orm'
import type { Client, ClientSummary, Project, ProjectSummary } from '@shared/domain/crm'
import { clients, payments, platforms, projects, timeEntries } from '../../db/schema'
import type { Orm } from '../../db/client'
import type { ModuleContext } from '../context'
import { monthsBilled, round2, toPayment, toTime, type ProjectRepo } from './shared'

/** Money math per project (earned, paid, outstanding, effective rate) and its roll-up per client. */
export class CrmSummaries {
  constructor(
    private readonly m: ModuleContext,
    private readonly projectRepo: ProjectRepo
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  projects(list: Project[]): ProjectSummary[] {
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
      const mine = times.filter((t) => t.projectId === p.id).map(toTime)
      const trackedMinutes = mine.reduce((s, t) => s + t.minutes, 0)
      const billableMinutes = mine.filter((t) => t.billable).reduce((s, t) => s + t.minutes, 0)
      const myPays = pays.filter((x) => x.projectId === p.id && x.currency === p.currency)
      const overdue = myPays.map(toPayment).filter((x) => x.overdue)
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
        outstandingAmount,
        overduePayments: overdue.length,
        overdueAmount: round2(overdue.reduce((s, x) => s + x.amount, 0))
      }
    })
  }

  clients(list: Client[]): ClientSummary[] {
    if (!list.length) return []
    const projectsOf = this.projects(
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
        outstandingTotal: sameCur.reduce((s, p) => s + p.outstandingAmount, 0),
        overduePayments: mine.reduce((s, p) => s + p.overduePayments, 0),
        overdueTotal: round2(sameCur.reduce((s, p) => s + p.overdueAmount, 0))
      }
    })
  }
}
