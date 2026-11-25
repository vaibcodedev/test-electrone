/**
 * Personal finance around freelancing: income (net of platform fees, derived from contract payments),
 * recurring subscriptions with a per-month paid checklist, one-off expenses, withdrawals with FX.
 */
import { z } from 'zod'
import { MAX } from './limits'
import { idSchema, timestampSchema, urlSchema, patchOf } from './common'
import { CURRENCIES, type Currency } from './crm'

export const EXPENSE_CATEGORIES = [
  'subscription',
  'connects',
  'software',
  'hardware',
  'phone',
  'internet',
  'education',
  'taxes',
  'bank',
  'other'
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/* ───────────── Subscriptions ───────────── */

export const SUBSCRIPTION_PERIODS = ['monthly', 'yearly'] as const
export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number]

export const subscriptionInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  amount: z.number().min(0).max(1_000_000),
  currency: z.enum(CURRENCIES).default('USD'),
  period: z.enum(SUBSCRIPTION_PERIODS).default('monthly'),
  /** Day of month it is charged (1–31). */
  billingDay: z.number().int().min(1).max(31).default(1),
  /** For yearly: month index 0–11. */
  billingMonth: z.number().int().min(0).max(11).default(0),
  category: z.enum(EXPENSE_CATEGORIES).default('subscription'),
  url: urlSchema.default(''),
  note: z.string().max(5000).default(''),
  active: z.boolean().default(true),
  startedAt: timestampSchema.nullable().default(null),
  /**
   * false — a client pays it (their server, hosting): it stays on the list and in the calendar, but no Finance
   * total, month sum, chart or weekly review counts it.
   */
  ownExpense: z.boolean().default(true)
})
export const subscriptionPatchSchema = patchOf(subscriptionInputSchema)
export type SubscriptionInput = z.input<typeof subscriptionInputSchema>
export type SubscriptionPatch = z.input<typeof subscriptionPatchSchema>

export interface Subscription {
  id: string
  title: string
  amount: number
  currency: Currency
  period: SubscriptionPeriod
  billingDay: number
  billingMonth: number
  category: ExpenseCategory
  url: string
  note: string
  active: boolean
  startedAt: number | null
  ownExpense: boolean
  createdAt: number
  updatedAt: number
  /** The access (Клієнти й контракти › Доступи) this subscription pays for; null — none. */
  credential: SubscriptionCredential | null
}

/** Back link from a subscription to its access: the access lives on its client's or project's page. */
export interface SubscriptionCredential {
  id: string
  label: string
  owner: { type: 'client' | 'project'; id: string } | null
}

/**
 * The next billing day on or after `at` (noon, local — as the month list places it): the billing day clamped to
 * the month's length, yearly ones in their month; not before the month it started in. null — switched off.
 */
export function nextBillingAt(
  s: Pick<Subscription, 'period' | 'billingDay' | 'billingMonth' | 'active' | 'startedAt'>,
  at = Date.now()
): number | null {
  if (!s.active) return null
  const from = new Date(Math.max(at, s.startedAt ?? 0))
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const on = (y: number, m: number): number =>
    new Date(y, m, Math.min(s.billingDay, new Date(y, m + 1, 0).getDate()), 12).getTime()
  for (let i = 0; i < 25; i++) {
    const y = from.getFullYear()
    const m = from.getMonth() + i
    if (s.period === 'yearly' && ((m % 12) + 12) % 12 !== s.billingMonth) continue
    const due = on(y, m)
    if (due >= today) return due
  }
  return null
}

/** A subscription as it appears in a given month: due or not, paid or not. */
export interface SubscriptionMonthRow extends Subscription {
  dueAt: number
  /** Expense created when it was marked paid this month. */
  expenseId: string | null
  paidAmount: number | null
}

/* ───────────── Expenses ───────────── */

export const expenseInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  amount: z.number().min(0).max(100_000_000),
  currency: z.enum(CURRENCIES).default('USD'),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  at: timestampSchema,
  subscriptionId: idSchema.nullable().default(null),
  note: z.string().max(5000).default('')
})
export const expensePatchSchema = patchOf(expenseInputSchema)
export type ExpenseInput = z.input<typeof expenseInputSchema>
export type ExpensePatch = z.input<typeof expensePatchSchema>

export interface Expense {
  id: string
  title: string
  amount: number
  currency: Currency
  category: ExpenseCategory
  at: number
  subscriptionId: string | null
  note: string
  createdAt: number
}

/* ───────────── Withdrawals ───────────── */

export const withdrawalInputSchema = z.object({
  /** Platform it was withdrawn from; null = other source. */
  platformId: idSchema.nullable().default(null),
  amount: z.number().min(0).max(100_000_000),
  currency: z.enum(CURRENCIES).default('USD'),
  /** Fee charged for the withdrawal, in the source currency. */
  fee: z.number().min(0).max(100_000_000).default(0),
  /** Exchange rate source→target (1 USD = rate UAH). */
  /** 1 unit of `currency` in the received currency: GBP → UAH is ~55, so 1 000 is a generous ceiling. */
  rate: z.number().min(0).max(1000).default(1),
  receivedCurrency: z.enum(CURRENCIES).default('UAH'),
  /** Actually received; when omitted it is (amount − fee) × rate. */
  received: z.number().min(0).max(1_000_000_000).nullable().default(null),
  method: z.string().max(100).default(''),
  at: timestampSchema,
  note: z.string().max(5000).default('')
})
export const withdrawalPatchSchema = patchOf(withdrawalInputSchema)
export type WithdrawalInput = z.input<typeof withdrawalInputSchema>
export type WithdrawalPatch = z.input<typeof withdrawalPatchSchema>

export interface Withdrawal {
  id: string
  platformId: string | null
  amount: number
  currency: Currency
  fee: number
  rate: number
  receivedCurrency: Currency
  received: number
  method: string
  at: number
  note: string
  createdAt: number
}

/* ───────────── Income (derived) & monthly report ───────────── */

/** A paid contract payment with the platform fee applied. */
export interface IncomeRow {
  paymentId: string
  projectId: string
  projectTitle: string
  clientName: string | null
  platformId: string | null
  platformName: string | null
  gross: number
  feePercent: number
  fee: number
  net: number
  currency: Currency
  paidAt: number
}

export type MoneyByCurrency = Partial<Record<Currency, number>>

export interface MonthReport {
  month: string // yyyy-mm
  from: number
  to: number
  gross: MoneyByCurrency
  fees: MoneyByCurrency
  net: MoneyByCurrency
  expenses: MoneyByCurrency
  /** Credits purchased this month (counted as expense category "connects"). */
  creditPurchases: MoneyByCurrency
  withdrawn: MoneyByCurrency
  received: MoneyByCurrency
  withdrawalFees: MoneyByCurrency
  /** net − expenses − creditPurchases (per currency). */
  profit: MoneyByCurrency
  expensesByCategory: { category: ExpenseCategory; amount: number; currency: Currency }[]
  income: IncomeRow[]
  subscriptionsDue: number
  subscriptionsPaid: number
}

export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })
export type MonthQuery = z.infer<typeof monthQuerySchema>

/** `finance.overview`: the month picked on the page moves the 12-month chart window when it's older. */
export const financeOverviewQuerySchema = z
  .object({ month: monthQuerySchema.shape.month.optional() })
  .optional()
export type FinanceOverviewQuery = z.infer<typeof financeOverviewQuerySchema>

export interface FinanceOverview {
  /** 12 months, oldest first: the last 12, or the 12 ending with the requested older month. */
  months: {
    month: string
    net: MoneyByCurrency
    expenses: MoneyByCurrency
    profit: MoneyByCurrency
  }[]
  /** Net earned on each platform minus withdrawals from it = still on the platform. */
  platformBalances: { platformId: string; name: string; currency: Currency; balance: number }[]
  monthlySubscriptions: MoneyByCurrency
}

/* ───────────── Rate calculator ───────────── */

export const rateCalcSchema = z.object({
  /** Desired money on hand per month, after everything. */
  targetNet: z.number().min(0).max(10_000_000),
  hoursPerWeek: z.number().min(1).max(100),
  /** Share of working time that is billable (rest = proposals, calls, learning). */
  billableShare: z.number().min(5).max(100),
  feePercent: z.number().min(0).max(100),
  withdrawalFeePercent: z.number().min(0).max(100).default(0),
  /** Taxes as % of what is received. */
  taxPercent: z.number().min(0).max(100).default(0),
  /** Monthly expenses to cover (subscriptions, connects…). */
  monthlyExpenses: z.number().min(0).max(10_000_000).default(0),
  vacationWeeks: z.number().min(0).max(30).default(4)
})
export type RateCalcInput = z.infer<typeof rateCalcSchema>
export interface RateCalcResult {
  billableHoursPerMonth: number
  grossNeeded: number
  hourlyRate: number
  /** For fixed projects: price for N estimated hours. */
  breakdown: { label: string; amount: number }[]
}

/** Pure rate calculator — shared so the renderer can compute instantly. */
export function calculateRate(i: RateCalcInput): RateCalcResult {
  const workingWeeks = Math.max(1, 52 - i.vacationWeeks)
  const billableHoursPerMonth = (i.hoursPerWeek * (i.billableShare / 100) * workingWeeks) / 12
  const keepAfterTax = 1 - i.taxPercent / 100
  const keepAfterWithdraw = 1 - i.withdrawalFeePercent / 100
  const keepAfterFee = 1 - i.feePercent / 100
  const neededOnHand = i.targetNet + i.monthlyExpenses
  const beforeTax = neededOnHand / Math.max(0.01, keepAfterTax)
  const beforeWithdraw = beforeTax / Math.max(0.01, keepAfterWithdraw)
  const grossNeeded = beforeWithdraw / Math.max(0.01, keepAfterFee)
  const hourlyRate = grossNeeded / Math.max(1, billableHoursPerMonth)
  const r = (n: number): number => Math.round(n * 100) / 100
  return {
    billableHoursPerMonth: r(billableHoursPerMonth),
    grossNeeded: r(grossNeeded),
    hourlyRate: r(hourlyRate),
    breakdown: [
      { label: 'На руки', amount: r(i.targetNet) },
      { label: 'Витрати', amount: r(i.monthlyExpenses) },
      { label: 'Податки', amount: r(beforeTax - neededOnHand) },
      { label: 'Виведення', amount: r(beforeWithdraw - beforeTax) },
      { label: 'Комісія платформи', amount: r(grossNeeded - beforeWithdraw) }
    ]
  }
}
