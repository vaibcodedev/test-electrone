import { z } from 'zod'
import { idSchema, timestampSchema, urlSchema, withTagIds, type EntityBase, type WithTags } from './common'

export const CURRENCIES = ['USD', 'EUR', 'UAH', 'PLN', 'GBP'] as const
export type Currency = (typeof CURRENCIES)[number]

/* ───────────── Clients ───────────── */

export const CLIENT_STATUSES = ['lead', 'active', 'paused', 'archived'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const clientInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().max(200).default(''),
  email: z.string().max(320).default(''),
  phone: z.string().max(100).default(''),
  messenger: z.string().max(200).default(''),
  website: urlSchema.default(''),
  notes: z.string().max(100_000).default(''),
  status: z.enum(CLIENT_STATUSES).default('active'),
  currency: z.enum(CURRENCIES).default('USD'),
  defaultRate: z.number().min(0).max(100_000).default(0),
  ...withTagIds
})
export const clientPatchSchema = clientInputSchema.partial()
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
  defaultRate: number
}

export interface ClientSummary extends Client {
  projectCount: number
  activeProjectCount: number
  trackedMinutes: number
  paidTotal: number
  outstandingTotal: number
}

/* ───────────── Projects ───────────── */

export const PROJECT_STATUSES = ['lead', 'active', 'paused', 'done', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const BILLING_TYPES = ['hourly', 'fixed', 'retainer'] as const
export type BillingType = (typeof BILLING_TYPES)[number]

export const projectInputSchema = z.object({
  clientId: idSchema.nullable().default(null),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(100_000).default(''),
  status: z.enum(PROJECT_STATUSES).default('active'),
  billing: z.enum(BILLING_TYPES).default('hourly'),
  rate: z.number().min(0).max(100_000).default(0),
  fixedPrice: z.number().min(0).max(100_000_000).default(0),
  currency: z.enum(CURRENCIES).default('USD'),
  budgetHours: z.number().min(0).max(100_000).default(0),
  startAt: timestampSchema.nullable().default(null),
  dueAt: timestampSchema.nullable().default(null),
  repoUrl: urlSchema.default(''),
  stagingUrl: urlSchema.default(''),
  prodUrl: urlSchema.default(''),
  adminUrl: urlSchema.default(''),
  ...withTagIds
})
export const projectPatchSchema = projectInputSchema.partial()
export type ProjectInput = z.input<typeof projectInputSchema>
export type ProjectPatch = z.input<typeof projectPatchSchema>

export const projectListQuerySchema = z.object({
  clientId: idSchema.optional(),
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
}

export interface ProjectSummary extends Project {
  clientName: string | null
  trackedMinutes: number
  /** Value of billable work: hours × rate for hourly, fixedPrice for fixed. */
  earnedAmount: number
  paidAmount: number
  outstandingAmount: number
}

/* ───────────── Credentials (encrypted with OS keychain via safeStorage) ───────────── */

export const credentialInputSchema = z.object({
  projectId: idSchema.nullable().default(null),
  clientId: idSchema.nullable().default(null),
  label: z.string().trim().min(1).max(200),
  url: urlSchema.default(''),
  login: z.string().max(500).default(''),
  /** Plain text on input only; stored encrypted, never returned by list(). */
  secret: z.string().max(10_000).default(''),
  notes: z.string().max(10_000).default('')
})
export const credentialPatchSchema = credentialInputSchema.partial()
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
  description: z.string().max(2000).default(''),
  startedAt: timestampSchema,
  endedAt: timestampSchema.nullable().default(null),
  billable: z.boolean().default(true)
})
export const timeEntryPatchSchema = timeEntryInputSchema.partial()
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
  note: z.string().max(2000).default('')
})
export const paymentPatchSchema = paymentInputSchema.partial()
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
  timeEntries: TimeEntry[]
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
  overduePayments: number
}
