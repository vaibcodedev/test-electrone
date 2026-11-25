import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import type { GoalsApi } from '@shared/api'
import type { Currency } from '@shared/domain/crm'
import {
  goalInputSchema,
  goalPatchSchema,
  type Goal,
  type GoalMetric,
  type GoalPeriod,
  type GoalProgress
} from '@shared/domain/freelance'
import { goals, payments, platforms, projects } from '../../db/schema'
import type { Orm } from '../../db/client'
import { addDays, newId, now, NotFoundError, startOfMonth, startOfWeek } from '../../core/util'
import { idArg, updateArgs, type ModuleContext } from '../context'
import type { ProposalStats } from './stats'

/** Weekly/monthly goals (proposals, replies, contracts, rates, net income) with their progress. */
export class Goals {
  constructor(
    private readonly m: ModuleContext,
    private readonly proposalStats: ProposalStats
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  private periodRange(period: GoalPeriod, at = now()): [number, number] {
    if (period === 'week') return [startOfWeek(at), addDays(startOfWeek(at), 7) - 1]
    const start = startOfMonth(at)
    const d = new Date(start)
    return [start, new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1]
  }

  /**
   * Net paid (after platform fee) in range. Amounts in different currencies are never added up:
   * a platform goal counts only payments in the platform's currency; a goal over all platforms
   * counts the currency with the largest net income in the period (USD when nothing was paid).
   */
  private netIncome(
    from: number,
    to: number,
    platformId: string | null
  ): { value: number; currency: Currency } {
    const rows = this.db
      .select({
        amount: payments.amount,
        currency: payments.currency,
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
    const byCurrency = new Map<string, number>()
    for (const r of rows) {
      const net = r.amount * (1 - (r.fee ?? r.platformFee ?? 0) / 100)
      byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + net)
    }
    const platformCurrency = platformId
      ? this.db
          .select({ currency: platforms.currency })
          .from(platforms)
          .where(eq(platforms.id, platformId))
          .get()?.currency
      : undefined
    const currency = ((platformCurrency ??
      [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]) ??
      'USD') as Currency
    return { value: Math.round((byCurrency.get(currency) ?? 0) * 100) / 100, currency }
  }

  private metricValue(
    metric: GoalMetric,
    from: number,
    to: number,
    platformId: string | null
  ): { value: number; currency: Currency | null } {
    if (metric === 'net_income') return this.netIncome(from, to, platformId)
    const f = this.proposalStats.stats({ from, to, platformId: platformId ?? undefined }).totals
    const value = {
      proposals: f.sent,
      replies: f.replied,
      contracts: f.hired,
      reply_rate: f.replyRate,
      hire_rate: f.hireRate
    }[metric]
    return { value, currency: null }
  }

  api(): GoalsApi {
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
            const { value: current, currency } = this.metricValue(
              g.metric,
              periodStart,
              periodEnd,
              g.platformId
            )
            return {
              ...g,
              current,
              currency,
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
        if (!row) throw new NotFoundError('Ціль', id)
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
}
