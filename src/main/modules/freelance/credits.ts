import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { CreditsApi } from '@shared/api'
import type { Currency } from '@shared/domain/crm'
import { creditTxInputSchema, type CreditKind, type CreditsSummary, type CreditTx } from '@shared/domain/freelance'
import { creditTxs, platforms, proposals } from '../../db/schema'
import type { Orm } from '../../db/client'
import { newId, now, UserError } from '../../core/util'
import { idArg, type ModuleContext } from '../context'
import type { Platforms } from './platforms'

/** Bid credits ledger per platform: purchases, bonuses, refunds and what was spent on proposals. */
export class Credits {
  constructor(
    private readonly m: ModuleContext,
    private readonly platforms: Platforms
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  summary(platformId: string): CreditsSummary {
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
    const avg = purchased ? moneySpent / purchased : this.platforms.get(platformId).creditPrice || null
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

  api(): CreditsApi {
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
        this.platforms.get(data.platformId)
        if (data.kind !== 'adjust' && data.amount < 0)
          throw new UserError('Кількість має бути додатною')
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
        this.summary(z.object({ platformId: idArg }).parse(args).platformId)
    }
  }

  /** Purchases in range grouped by platform currency (finance report). */
  purchases(from: number, to: number): { currency: Currency; cost: number }[] {
    return this.db
      .select({ currency: platforms.currency, cost: sql<number>`sum(${creditTxs.cost})` })
      .from(creditTxs)
      .innerJoin(platforms, eq(platforms.id, creditTxs.platformId))
      .where(and(eq(creditTxs.kind, 'purchase'), gte(creditTxs.at, from), lte(creditTxs.at, to)))
      .groupBy(platforms.currency)
      .all() as { currency: Currency; cost: number }[]
  }
}
