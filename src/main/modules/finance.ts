/**
 * Finance hub backend. Income is derived from paid contract payments minus the contract/platform fee
 * (never entered twice). Subscriptions are recurring templates; marking one paid for a month creates an expense.
 */
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import type { FinanceApi } from '@shared/api'
import type { Currency } from '@shared/domain/crm'
import {
  expenseInputSchema,
  expensePatchSchema,
  monthQuerySchema,
  subscriptionInputSchema,
  subscriptionPatchSchema,
  withdrawalInputSchema,
  withdrawalPatchSchema,
  type Expense,
  type ExpenseCategory,
  type FinanceOverview,
  type IncomeRow,
  type MoneyByCurrency,
  type MonthReport,
  type Subscription,
  type SubscriptionMonthRow,
  type SubscriptionPeriod,
  type Withdrawal
} from '@shared/domain/finance'
import {
  clients,
  expenses,
  payments,
  platforms,
  projects,
  subscriptions,
  withdrawals
} from '../db/schema'
import { newId, now, NotFoundError } from '../core/util'
import { idArg, updateArgs, type ModuleContext } from './context'
import type { FreelanceModule } from './freelance'

const r2 = (n: number): number => Math.round(n * 100) / 100

function add(map: MoneyByCurrency, currency: Currency, amount: number): void {
  map[currency] = r2((map[currency] ?? 0) + amount)
}

function minus(a: MoneyByCurrency, ...bs: MoneyByCurrency[]): MoneyByCurrency {
  const out: MoneyByCurrency = { ...a }
  for (const b of bs) for (const [c, v] of Object.entries(b)) add(out, c as Currency, -(v ?? 0))
  return out
}

/** "2026-11" → [start, end] epoch ms (local time). */
export function monthRange(month: string): [number, number] {
  const [y, m] = month.split('-').map(Number)
  return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime() - 1]
}

export function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export class FinanceModule {
  constructor(
    private readonly m: ModuleContext,
    private readonly freelance: FreelanceModule
  ) {}

  private get db() {
    return this.m.db.orm
  }

  /* ───────── income ───────── */

  income(from: number, to: number): IncomeRow[] {
    return this.db
      .select({
        pay: payments,
        projectTitle: projects.title,
        feePercent: projects.feePercent,
        platformId: projects.platformId,
        platformName: platforms.name,
        platformFee: platforms.defaultFeePercent,
        clientName: clients.name
      })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .leftJoin(platforms, eq(platforms.id, projects.platformId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(
        and(
          isNull(projects.deletedAt),
          eq(payments.status, 'paid'),
          gte(payments.paidAt, from),
          lte(payments.paidAt, to)
        )
      )
      .orderBy(desc(payments.paidAt))
      .all()
      .map((r) => {
        const feePercent = r.feePercent ?? r.platformFee ?? 0
        const fee = r2((r.pay.amount * feePercent) / 100)
        return {
          paymentId: r.pay.id,
          projectId: r.pay.projectId,
          projectTitle: r.projectTitle,
          clientName: r.clientName,
          platformId: r.platformId,
          platformName: r.platformName,
          gross: r.pay.amount,
          feePercent,
          fee,
          net: r2(r.pay.amount - fee),
          currency: r.pay.currency as Currency,
          paidAt: r.pay.paidAt!
        }
      })
  }

  /* ───────── subscriptions ───────── */

  private toSub(r: typeof subscriptions.$inferSelect): Subscription {
    return {
      ...r,
      currency: r.currency as Currency,
      period: r.period as SubscriptionPeriod,
      category: r.category as ExpenseCategory
    }
  }

  private toExpense(r: typeof expenses.$inferSelect): Expense {
    return { ...r, currency: r.currency as Currency, category: r.category as ExpenseCategory }
  }

  private toWithdrawal(r: typeof withdrawals.$inferSelect): Withdrawal {
    return {
      ...r,
      currency: r.currency as Currency,
      receivedCurrency: r.receivedCurrency as Currency
    }
  }

  subscriptionMonth(month: string): SubscriptionMonthRow[] {
    const [from, to] = monthRange(month)
    const [y, mm] = month.split('-').map(Number)
    const daysInMonth = new Date(y, mm, 0).getDate()
    const subs = this.db
      .select()
      .from(subscriptions)
      .orderBy(asc(subscriptions.billingDay))
      .all()
      .map((r) => this.toSub(r))
    const paid = this.db
      .select()
      .from(expenses)
      .where(and(gte(expenses.at, from), lte(expenses.at, to)))
      .all()
      .filter((e) => e.subscriptionId)
    return subs
      .filter(
        (s) =>
          (s.active || paid.some((e) => e.subscriptionId === s.id)) &&
          (!s.startedAt || s.startedAt <= to)
      )
      .filter((s) => s.period === 'monthly' || s.billingMonth === mm - 1)
      .map((s) => {
        const e = paid.find((x) => x.subscriptionId === s.id)
        return {
          ...s,
          dueAt: new Date(y, mm - 1, Math.min(s.billingDay, daysInMonth), 12).getTime(),
          expenseId: e?.id ?? null,
          paidAmount: e?.amount ?? null
        }
      })
  }

  /* ───────── month report ───────── */

  month(month: string): MonthReport {
    const [from, to] = monthRange(month)
    const income = this.income(from, to)
    const gross: MoneyByCurrency = {}
    const fees: MoneyByCurrency = {}
    const net: MoneyByCurrency = {}
    for (const i of income) {
      add(gross, i.currency, i.gross)
      add(fees, i.currency, i.fee)
      add(net, i.currency, i.net)
    }
    const exp = this.db
      .select()
      .from(expenses)
      .where(and(gte(expenses.at, from), lte(expenses.at, to)))
      .all()
      .map((e) => this.toExpense(e))
    const expensesSum: MoneyByCurrency = {}
    const byCat = new Map<
      string,
      { category: ExpenseCategory; amount: number; currency: Currency }
    >()
    for (const e of exp) {
      add(expensesSum, e.currency, e.amount)
      const k = `${e.category}:${e.currency}`
      const cur = byCat.get(k) ?? { category: e.category, amount: 0, currency: e.currency }
      cur.amount = r2(cur.amount + e.amount)
      byCat.set(k, cur)
    }
    const creditPurchases: MoneyByCurrency = {}
    for (const c of this.freelance.creditPurchases(from, to)) {
      add(creditPurchases, c.currency, c.cost)
      const k = `connects:${c.currency}`
      const cur = byCat.get(k) ?? {
        category: 'connects' as ExpenseCategory,
        amount: 0,
        currency: c.currency
      }
      cur.amount = r2(cur.amount + c.cost)
      byCat.set(k, cur)
    }
    const wd = this.db
      .select()
      .from(withdrawals)
      .where(and(gte(withdrawals.at, from), lte(withdrawals.at, to)))
      .all()
    const withdrawn: MoneyByCurrency = {}
    const received: MoneyByCurrency = {}
    const withdrawalFees: MoneyByCurrency = {}
    for (const w of wd) {
      add(withdrawn, w.currency as Currency, w.amount)
      add(withdrawalFees, w.currency as Currency, w.fee)
      add(received, w.receivedCurrency as Currency, w.received)
    }
    const subs = this.subscriptionMonth(month)
    return {
      month,
      from,
      to,
      gross,
      fees,
      net,
      expenses: expensesSum,
      creditPurchases,
      withdrawn,
      received,
      withdrawalFees,
      profit: minus(net, expensesSum, creditPurchases, withdrawalFees),
      expensesByCategory: [...byCat.values()].sort((a, b) => b.amount - a.amount),
      income,
      subscriptionsDue: subs.length,
      subscriptionsPaid: subs.filter((s) => s.expenseId).length
    }
  }

  overview(): FinanceOverview {
    const months: FinanceOverview['months'] = []
    const d = new Date()
    for (let i = 11; i >= 0; i--) {
      const key = monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1).getTime())
      const r = this.month(key)
      months.push({ month: key, net: r.net, expenses: minus(r.expenses, {}), profit: r.profit })
      for (const [c, v] of Object.entries(r.creditPurchases))
        add(months[months.length - 1].expenses, c as Currency, v ?? 0)
    }
    const allIncome = this.income(0, now())
    const plats = this.db.select().from(platforms).where(eq(platforms.archived, false)).all()
    const platformBalances = plats
      .filter((p) => p.kind !== 'direct')
      .map((p) => {
        const earned = allIncome
          .filter((i) => i.platformId === p.id && i.currency === p.currency)
          .reduce((s, i) => s + i.net, 0)
        const out = this.db
          .select()
          .from(withdrawals)
          .where(eq(withdrawals.platformId, p.id))
          .all()
          .filter((w) => w.currency === p.currency)
          .reduce((s, w) => s + w.amount, 0)
        return {
          platformId: p.id,
          name: p.name,
          currency: p.currency as Currency,
          balance: r2(earned - out)
        }
      })
    const monthlySubscriptions: MoneyByCurrency = {}
    for (const s of this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.active, true))
      .all()) {
      add(
        monthlySubscriptions,
        s.currency as Currency,
        s.period === 'yearly' ? s.amount / 12 : s.amount
      )
    }
    return { months, platformBalances, monthlySubscriptions }
  }

  /* ───────── API ───────── */

  api(): FinanceApi {
    const range = z.object({ from: z.number(), to: z.number() })
    return {
      overview: async () => this.overview(),
      month: async (args) => this.month(monthQuerySchema.parse(args).month),
      income: async (args) => {
        const { from, to } = range.parse(args)
        return this.income(from, to)
      },
      subscriptions: async () =>
        this.db
          .select()
          .from(subscriptions)
          .orderBy(desc(subscriptions.active), asc(subscriptions.billingDay))
          .all()
          .map((r) => this.toSub(r)),
      subscriptionMonth: async (args) => this.subscriptionMonth(monthQuerySchema.parse(args).month),
      createSubscription: async (input) => {
        const data = subscriptionInputSchema.parse(input)
        const ts = now()
        return this.toSub(
          this.db
            .insert(subscriptions)
            .values({ ...data, id: newId(), createdAt: ts, updatedAt: ts })
            .returning()
            .get()
        )
      },
      updateSubscription: async (args) => {
        const { id, patch } = updateArgs(subscriptionPatchSchema).parse(args)
        const row = this.db
          .update(subscriptions)
          .set({ ...patch, updatedAt: now() })
          .where(eq(subscriptions.id, id))
          .returning()
          .get()
        if (!row) throw new NotFoundError('Підписка', id)
        return this.toSub(row)
      },
      removeSubscription: async (id) => {
        // Past expenses stay (history); only the template goes.
        this.db
          .delete(subscriptions)
          .where(eq(subscriptions.id, idArg.parse(id)))
          .run()
      },
      setSubscriptionPaid: async (args) => {
        const { id, month, paid, amount } = z
          .object({
            id: idArg,
            month: z.string().regex(/^\d{4}-\d{2}$/),
            paid: z.boolean(),
            amount: z.number().min(0).optional()
          })
          .parse(args)
        const row = this.subscriptionMonth(month).find((s) => s.id === id)
        const sub =
          row ??
          this.toSub(this.db.select().from(subscriptions).where(eq(subscriptions.id, id)).get()!)
        if (!sub) throw new NotFoundError('Підписка', id)
        const [from, to] = monthRange(month)
        this.db
          .delete(expenses)
          .where(and(eq(expenses.subscriptionId, id), gte(expenses.at, from), lte(expenses.at, to)))
          .run()
        if (paid) {
          this.db
            .insert(expenses)
            .values({
              id: newId(),
              title: sub.title,
              amount: amount ?? sub.amount,
              currency: sub.currency,
              category: sub.category,
              at: row?.dueAt ?? from,
              subscriptionId: id,
              note: '',
              createdAt: now()
            })
            .run()
        }
      },
      expenses: async (args) => {
        const { from, to } = range.parse(args)
        return this.db
          .select()
          .from(expenses)
          .where(and(gte(expenses.at, from), lte(expenses.at, to)))
          .orderBy(desc(expenses.at))
          .all()
          .map((e) => this.toExpense(e))
      },
      createExpense: async (input) => {
        const data = expenseInputSchema.parse(input)
        return this.toExpense(
          this.db
            .insert(expenses)
            .values({ ...data, id: newId(), createdAt: now() })
            .returning()
            .get()
        )
      },
      updateExpense: async (args) => {
        const { id, patch } = updateArgs(expensePatchSchema).parse(args)
        const row = this.db.update(expenses).set(patch).where(eq(expenses.id, id)).returning().get()
        if (!row) throw new NotFoundError('Витрата', id)
        return this.toExpense(row)
      },
      removeExpense: async (id) => {
        this.db
          .delete(expenses)
          .where(eq(expenses.id, idArg.parse(id)))
          .run()
      },
      withdrawals: async (args) => {
        const q = z
          .object({ from: z.number().optional(), to: z.number().optional() })
          .parse(args ?? {})
        return this.db
          .select()
          .from(withdrawals)
          .where(
            and(
              q.from !== undefined ? gte(withdrawals.at, q.from) : undefined,
              q.to !== undefined ? lte(withdrawals.at, q.to) : undefined
            )
          )
          .orderBy(desc(withdrawals.at))
          .all()
          .map((w) => this.toWithdrawal(w))
      },
      createWithdrawal: async (input) => {
        const data = withdrawalInputSchema.parse(input)
        const received = data.received ?? r2((data.amount - data.fee) * data.rate)
        return this.toWithdrawal(
          this.db
            .insert(withdrawals)
            .values({ ...data, received, id: newId(), createdAt: now() })
            .returning()
            .get()
        )
      },
      updateWithdrawal: async (args) => {
        const { id, patch } = updateArgs(withdrawalPatchSchema).parse(args)
        const cur = this.db.select().from(withdrawals).where(eq(withdrawals.id, id)).get()
        if (!cur) throw new NotFoundError('Виведення', id)
        const next = { ...cur, ...patch }
        const recompute =
          patch.received === undefined &&
          (patch.amount !== undefined || patch.fee !== undefined || patch.rate !== undefined)
        const received =
          patch.received ?? (recompute ? r2((next.amount - next.fee) * next.rate) : cur.received)
        const row = this.db
          .update(withdrawals)
          .set({ ...patch, received: received ?? 0 })
          .where(eq(withdrawals.id, id))
          .returning()
          .get()
        return this.toWithdrawal(row!)
      },
      removeWithdrawal: async (id) => {
        this.db
          .delete(withdrawals)
          .where(eq(withdrawals.id, idArg.parse(id)))
          .run()
      }
    }
  }
}
