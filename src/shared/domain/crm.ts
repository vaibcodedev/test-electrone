import { z } from 'zod'
import { MAX } from './limits'
import {
  clientRatingSchema,
  clientSpentSchema,
  EMAIL_ERROR,
  hireRateSchema,
  idSchema,
  isLikelyEmail,
  timestampSchema,
  urlSchema,
  withTagIds,
  type EntityBase,
  type WithTags,
  patchOf
} from './common'

export const CURRENCIES = ['USD', 'EUR', 'UAH', 'PLN', 'GBP'] as const
export type Currency = (typeof CURRENCIES)[number]

/**
 * How work is paid:
 *  - fixed    — one price for the whole project, paid in stages (payments = этапы)
 *  - hourly   — tracked billable hours × rate
 *  - retainer — fixed fee per month (fixedPrice = monthly fee), from startAt
 *  - none     — own / free project, time tracking only
 */
export const BILLING_TYPES = ['fixed', 'hourly', 'retainer', 'none'] as const
export type BillingType = (typeof BILLING_TYPES)[number]

/* ───────────── Clients ───────────── */

/** avoid = «не работать»: client to skip next time (see red flags). */
export const CLIENT_STATUSES = ['lead', 'active', 'paused', 'archived', 'avoid'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const clientInputSchema = z.object({
  name: z.string().trim().min(1).max(MAX.name),
  company: z.string().max(MAX.name).default(''),
  // Only new values are checked (per-field patches): an old unusual email never blocks other edits.
  email: z.string().trim().max(320).refine(isLikelyEmail, EMAIL_ERROR).default(''),
  phone: z.string().max(100).default(''),
  messenger: z.string().max(MAX.name).default(''),
  website: urlSchema.default(''),
  notes: z.string().max(MAX.note).default(''),
  status: z.enum(CLIENT_STATUSES).default('active'),
  currency: z.enum(CURRENCIES).default('USD'),
  /** Preferred billing for new projects of this client. */
  defaultBilling: z.enum(BILLING_TYPES).default('fixed'),
  /** Hourly rate (hourly) or monthly fee (retainer) used as default for new projects. */
  defaultRate: z.number().min(0).max(100_000_000).default(0),
  /** Where the client came from (freelance platform); null = direct/unknown. */
  platformId: idSchema.nullable().default(null),
  country: z.string().max(MAX.label).default(''),
  rating: clientRatingSchema.nullable().default(null),
  /** Total spent on the platform (as shown on the client profile). */
  totalSpent: clientSpentSchema.nullable().default(null),
  hireRate: hireRateSchema.nullable().default(null),
  paymentVerified: z.boolean().nullable().default(null),
  /** Notes on how to communicate with this client. */
  howToCommunicate: z.string().max(MAX.note).default(''),
  ...withTagIds
})
export const clientPatchSchema = patchOf(clientInputSchema)
export type ClientInput = z.input<typeof clientInputSchema>
export type ClientPatch = z.input<typeof clientPatchSchema>

export interface Client extends EntityBase, WithTags {
  name: string
  company: string
  email: string
  phone: string
  messenger: string
  website: string
  notes: string
  status: ClientStatus
  currency: Currency
  defaultBilling: BillingType
  defaultRate: number
  platformId: string | null
  country: string
  rating: number | null
  totalSpent: number | null
  hireRate: number | null
  paymentVerified: boolean | null
  howToCommunicate: string
}

export interface ClientSummary extends Client {
  projectCount: number
  activeProjectCount: number
  trackedMinutes: number
  paidTotal: number
  outstandingTotal: number
  /** Expected or invoiced payments past their due date, over all the client's projects. */
  overduePayments: number
  /** Their sum in the client's currency (projects in other currencies are left out, as in outstandingTotal). */
  overdueTotal: number
}

/* ───────────── Projects ───────────── */

export const PROJECT_STATUSES = ['lead', 'active', 'paused', 'done', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/** Project status as the UI writes it (main: search, pins, trash; renderer: the page). */
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: 'Потенційний',
  active: 'У роботі',
  paused: 'На паузі',
  done: 'Завершено',
  cancelled: 'Скасовано'
}

export const projectInputSchema = z.object({
  clientId: idSchema.nullable().default(null),
  title: z.string().trim().min(1).max(MAX.title),
  description: z.string().max(MAX.jobPost).default(''),
  status: z.enum(PROJECT_STATUSES).default('active'),
  billing: z.enum(BILLING_TYPES).default('fixed'),
  /** Hourly rate — only for billing = hourly. */
  rate: z.number().min(0).max(100_000).default(0),
  /** Project price (fixed) or monthly fee (retainer). */
  fixedPrice: z.number().min(0).max(100_000_000).default(0),
  currency: z.enum(CURRENCIES).default('USD'),
  budgetHours: z.number().min(0).max(100_000).default(0),
  startAt: timestampSchema.nullable().default(null),
  dueAt: timestampSchema.nullable().default(null),
  repoUrl: urlSchema.default(''),
  stagingUrl: urlSchema.default(''),
  prodUrl: urlSchema.default(''),
  adminUrl: urlSchema.default(''),
  /** Freelance platform of the contract; null = direct. */
  platformId: idSchema.nullable().default(null),
  /** Platform fee % for this contract (Upwork: 0–15%, known at bidding); null = platform default. */
  feePercent: z.number().min(0).max(100).nullable().default(null),
  ...withTagIds
})
export const projectPatchSchema = patchOf(projectInputSchema)
export type ProjectInput = z.input<typeof projectInputSchema>
export type ProjectPatch = z.input<typeof projectPatchSchema>

/** Platform filter: an id, or 'direct' = no platform (прямі замовлення). */
const platformFilter = z.union([idSchema, z.literal('direct')]).optional()

export const clientListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  platformId: platformFilter
})
export type ClientListQuery = z.infer<typeof clientListQuerySchema>

export const projectListQuerySchema = z.object({
  clientId: idSchema.optional(),
  platformId: platformFilter,
  status: z.enum(PROJECT_STATUSES).optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional()
})
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>

export interface Project extends EntityBase, WithTags {
  clientId: string | null
  title: string
  description: string
  status: ProjectStatus
  billing: BillingType
  rate: number
  fixedPrice: number
  currency: Currency
  budgetHours: number
  startAt: number | null
  dueAt: number | null
  repoUrl: string
  stagingUrl: string
  prodUrl: string
  adminUrl: string
  platformId: string | null
  feePercent: number | null
  proposalId: string | null
}

export interface ProjectSummary extends Project {
  clientName: string | null
  platformName: string | null
  /** Fee actually applied: contract value or platform default. */
  effectiveFeePercent: number
  /** Paid amount after the platform fee — money that reached you. */
  netPaidAmount: number
  trackedMinutes: number
  /** Value of the work so far: hours × rate (hourly), price (fixed), fee × months (retainer), 0 (none). */
  earnedAmount: number
  /** Earned / tracked hours — the real hourly rate for fixed and retainer work. */
  effectiveRate: number | null
  /** Retainer only: number of billed months so far. */
  retainerMonths: number
  paidAmount: number
  outstandingAmount: number
  /** Expected or invoiced payments of this project past their due date (project currency). */
  overduePayments: number
  /** Their sum in the project currency. */
  overdueAmount: number
}

/* ───────────── Credentials (encrypted with OS keychain via safeStorage) ───────────── */

export const credentialInputSchema = z.object({
  projectId: idSchema.nullable().default(null),
  clientId: idSchema.nullable().default(null),
  label: z.string().trim().min(1).max(MAX.name),
  url: urlSchema.default(''),
  login: z.string().max(MAX.line).default(''),
  /** Plain text on input only; stored encrypted, never returned by list(). */
  secret: z.string().max(MAX.secret).default(''),
  notes: z.string().max(MAX.note).default('')
})
export const credentialPatchSchema = patchOf(credentialInputSchema)
export type CredentialInput = z.input<typeof credentialInputSchema>
export type CredentialPatch = z.input<typeof credentialPatchSchema>

export interface Credential {
  id: string
  projectId: string | null
  clientId: string | null
  label: string
  url: string
  login: string
  hasSecret: boolean
  notes: string
  createdAt: number
  updatedAt: number
}

/* ───────────── Time tracking ───────────── */

export const timeEntryInputSchema = z.object({
  projectId: idSchema,
  description: z.string().max(MAX.short).default(''),
  startedAt: timestampSchema,
  endedAt: timestampSchema.nullable().default(null),
  billable: z.boolean().default(true)
})
export const timeEntryPatchSchema = patchOf(timeEntryInputSchema)
export type TimeEntryInput = z.input<typeof timeEntryInputSchema>
export type TimeEntryPatch = z.input<typeof timeEntryPatchSchema>

export interface TimeEntry {
  id: string
  projectId: string
  description: string
  startedAt: number
  endedAt: number | null
  minutes: number
  billable: boolean
  createdAt: number
}

export interface RunningTimer extends TimeEntry {
  projectTitle: string
}

/* ───────────── Payments ───────────── */

export const PAYMENT_STATUSES = ['expected', 'invoiced', 'paid', 'cancelled'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const paymentInputSchema = z.object({
  projectId: idSchema,
  amount: z.number().min(0).max(100_000_000),
  currency: z.enum(CURRENCIES).default('USD'),
  status: z.enum(PAYMENT_STATUSES).default('expected'),
  dueAt: timestampSchema.nullable().default(null),
  paidAt: timestampSchema.nullable().default(null),
  note: z.string().max(MAX.short).default('')
})
export const paymentPatchSchema = patchOf(paymentInputSchema)
export type PaymentInput = z.input<typeof paymentInputSchema>
export type PaymentPatch = z.input<typeof paymentPatchSchema>

export interface Payment {
  id: string
  projectId: string
  amount: number
  currency: Currency
  status: PaymentStatus
  dueAt: number | null
  paidAt: number | null
  note: string
  createdAt: number
  /** Derived: expected/invoiced and dueAt in the past. */
  overdue: boolean
}

export interface ProjectDetails {
  project: ProjectSummary
  client: Client | null
  payments: Payment[]
  credentials: Credential[]
}

export interface ClientDetails {
  client: ClientSummary
  projects: ProjectSummary[]
  credentials: Credential[]
}

export interface CrmOverview {
  monthMinutes: number
  weekMinutes: number
  paidThisMonth: Partial<Record<Currency, number>>
  outstanding: Partial<Record<Currency, number>>
  activeProjects: number
  /** Live projects of any status (the «з N усього» under «Проєкти в роботі»). */
  totalProjects: number
  overduePayments: number
  /** Live projects per status — counts for the status chips on /clients. */
  projectsByStatus: Record<ProjectStatus, number>
  /** Live clients and projects per platform id; key 'direct' — without a platform. */
  byPlatform: Record<string, { clients: number; projects: number }>
}
