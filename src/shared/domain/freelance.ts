/**
 * Freelance: platforms (Upwork, Freelancehunt, direct…), proposals pipeline, bid credits (Connects),
 * message templates, portfolio cases, red flags and goals.
 * Clients and contracts are the shared CRM clients/projects with a `platformId`.
 */
import { z } from 'zod'
import {
  hexColorSchema,
  idSchema,
  timestampSchema,
  urlSchema,
  withTagIds,
  type EntityBase,
  type WithTags,
  patchOf
} from './common'
import { CURRENCIES, type Currency } from './crm'

/* ───────────── Platforms ───────────── */

export const PLATFORM_KINDS = ['upwork', 'freelancehunt', 'direct', 'other'] as const
export type PlatformKind = (typeof PLATFORM_KINDS)[number]

/** One pre-proposal check, e.g. "Оплата верифицирована". */
export const preCheckSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(200)
})
export type PreCheck = z.infer<typeof preCheckSchema>

export const platformInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(PLATFORM_KINDS).default('other'),
  color: hexColorSchema.default(null),
  currency: z.enum(CURRENCIES).default('USD'),
  /** Name of paid bid credits ("Connects"); empty = platform has no paid bids. */
  creditsName: z.string().max(40).default(''),
  /** Default price of one credit when buying (in platform currency). */
  creditPrice: z.number().min(0).max(1000).default(0),
  /** Default service fee %, overridden per contract (Upwork: 0–15%). */
  defaultFeePercent: z.number().min(0).max(100).default(0),
  /** Checklist shown before sending a proposal on this platform. */
  preChecklist: z.array(preCheckSchema).max(30).default([]),
  notes: z.string().max(20_000).default(''),
  archived: z.boolean().default(false)
})
export const platformPatchSchema = patchOf(platformInputSchema)
export type PlatformInput = z.input<typeof platformInputSchema>
export type PlatformPatch = z.input<typeof platformPatchSchema>

export interface Platform {
  id: string
  name: string
  kind: PlatformKind
  color: string | null
  currency: Currency
  creditsName: string
  creditPrice: number
  defaultFeePercent: number
  preChecklist: PreCheck[]
  notes: string
  archived: boolean
  position: number
  createdAt: number
  updatedAt: number
}

/* ───────────── Proposals ───────────── */

export const PROPOSAL_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'replied',
  'interview',
  'offer',
  'hired',
  'declined',
  'no_reply',
  'withdrawn',
  'closed'
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

/** Funnel stages used by statistics (a proposal "reached" a stage if its status is at or past it). */
export const PROPOSAL_FUNNEL: ProposalStatus[] = [
  'sent',
  'viewed',
  'replied',
  'interview',
  'offer',
  'hired'
]

export const BID_TYPES = ['fixed', 'hourly'] as const
export type BidType = (typeof BID_TYPES)[number]

export const proposalInputSchema = z.object({
  platformId: idSchema,
  jobTitle: z.string().trim().min(1).max(500),
  jobUrl: urlSchema.default(''),
  jobDescription: z.string().max(100_000).default(''),
  /** Type of task: "Next.js", "Вёрстка", "Боты"… (free text with suggestions). */
  niche: z.string().trim().max(100).default(''),
  status: z.enum(PROPOSAL_STATUSES).default('sent'),
  sentAt: timestampSchema.nullable().default(null),
  credits: z.number().int().min(0).max(1000).default(0),
  boostCredits: z.number().int().min(0).max(1000).default(0),
  bidType: z.enum(BID_TYPES).default('fixed'),
  bidAmount: z.number().min(0).max(10_000_000).default(0),
  /** Service fee % shown at bidding time (Upwork shows the exact one only then). */
  feePercent: z.number().min(0).max(100).nullable().default(null),
  coverLetter: z.string().max(50_000).default(''),
  templateId: idSchema.nullable().default(null),
  clientId: idSchema.nullable().default(null),
  clientName: z.string().max(200).default(''),
  clientCountry: z.string().max(100).default(''),
  clientRating: z.number().min(0).max(5).nullable().default(null),
  clientSpent: z.number().min(0).max(100_000_000).nullable().default(null),
  clientHireRate: z.number().min(0).max(100).nullable().default(null),
  paymentVerified: z.boolean().nullable().default(null),
  /** Competition shown on the job, e.g. "20 to 50". */
  proposalsOnJob: z.string().max(40).default(''),
  /** Ids of pre-checklist items that were ticked. */
  checks: z.array(z.string().max(40)).max(30).default([]),
  /** Marks a strong proposal worth reusing. */
  starred: z.boolean().default(false),
  notes: z.string().max(50_000).default(''),
  ...withTagIds
})
export const proposalPatchSchema = patchOf(proposalInputSchema.omit({ platformId: true }))
export type ProposalInput = z.input<typeof proposalInputSchema>
export type ProposalPatch = z.input<typeof proposalPatchSchema>

export const proposalListQuerySchema = z.object({
  platformId: idSchema.optional(),
  status: z.enum(PROPOSAL_STATUSES).optional(),
  niche: z.string().max(100).optional(),
  starred: z.boolean().optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional()
})
export type ProposalListQuery = z.infer<typeof proposalListQuerySchema>

export interface Proposal extends EntityBase, WithTags {
  platformId: string
  jobTitle: string
  jobUrl: string
  jobDescription: string
  niche: string
  status: ProposalStatus
  sentAt: number | null
  credits: number
  boostCredits: number
  bidType: BidType
  bidAmount: number
  feePercent: number | null
  coverLetter: string
  templateId: string | null
  clientId: string | null
  clientName: string
  clientCountry: string
  clientRating: number | null
  clientSpent: number | null
  clientHireRate: number | null
  paymentVerified: boolean | null
  proposalsOnJob: string
  checks: string[]
  starred: boolean
  notes: string
  /** When the status first moved to replied / hired (for response-time stats). */
  repliedAt: number | null
  hiredAt: number | null
  /** Contract (CRM project) created from this proposal. */
  projectId: string | null
}

/* ───────────── Bid credits (Connects) ledger ───────────── */

export const CREDIT_KINDS = ['purchase', 'bonus', 'refund', 'adjust'] as const
export type CreditKind = (typeof CREDIT_KINDS)[number]

export const creditTxInputSchema = z.object({
  platformId: idSchema,
  kind: z.enum(CREDIT_KINDS).default('purchase'),
  /** Credits added (negative only for "adjust"). */
  amount: z.number().int().min(-100_000).max(100_000),
  /** Money paid for a purchase, in platform currency. */
  cost: z.number().min(0).max(100_000).default(0),
  at: timestampSchema,
  note: z.string().max(1000).default('')
})
export type CreditTxInput = z.input<typeof creditTxInputSchema>

export interface CreditTx {
  id: string
  platformId: string
  kind: CreditKind
  amount: number
  cost: number
  at: number
  note: string
  createdAt: number
}

export interface CreditsSummary {
  platformId: string
  purchased: number
  bonus: number
  refunded: number
  spent: number
  balance: number
  moneySpent: number
  /** moneySpent / purchased. */
  avgCreditPrice: number | null
  contracts: number
  /** Money spent on credits for proposals ÷ contracts won. */
  costPerContract: number | null
  /** Credits spent ÷ contracts won. */
  creditsPerContract: number | null
}

/* ───────────── Message templates ───────────── */

export const TEMPLATE_SITUATIONS = [
  'proposal',
  'first_message',
  'estimate',
  'tz_questions',
  'revisions',
  'follow_up',
  'small_talk',
  'closing',
  'other'
] as const
export type TemplateSituation = (typeof TEMPLATE_SITUATIONS)[number]

export const templateInputSchema = z.object({
  situation: z.enum(TEMPLATE_SITUATIONS).default('proposal'),
  title: z.string().trim().min(1).max(200),
  /** What the client says / when to use it (for small talk: the client's phrase). */
  trigger: z.string().max(2000).default(''),
  /** Template text; {variables} are filled in when copying. */
  body: z.string().max(50_000).default(''),
  /** Native-language note: what it means / when not to use. */
  note: z.string().max(5000).default(''),
  niche: z.string().max(100).default(''),
  ...withTagIds
})
export const templatePatchSchema = patchOf(templateInputSchema)
export type TemplateInput = z.input<typeof templateInputSchema>
export type TemplatePatch = z.input<typeof templatePatchSchema>

export interface MessageTemplate extends EntityBase, WithTags {
  situation: TemplateSituation
  title: string
  trigger: string
  body: string
  note: string
  niche: string
  copyCount: number
  /** Proposals that used it, and how they went. */
  usedIn: number
  replied: number
  hired: number
}

/* ───────────── Portfolio cases ───────────── */

export const caseInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  niche: z.string().max(100).default(''),
  client: z.string().max(200).default(''),
  problem: z.string().max(20_000).default(''),
  whatDone: z.string().max(50_000).default(''),
  result: z.string().max(20_000).default(''),
  stack: z.string().max(500).default(''),
  url: urlSchema.default(''),
  /** Ready-to-paste English text for the platform portfolio. */
  textEn: z.string().max(50_000).default(''),
  projectId: idSchema.nullable().default(null),
  ...withTagIds
})
export const casePatchSchema = patchOf(caseInputSchema)
export type CaseInput = z.input<typeof caseInputSchema>
export type CasePatch = z.input<typeof casePatchSchema>

export interface PortfolioCase extends EntityBase, WithTags {
  title: string
  niche: string
  client: string
  problem: string
  whatDone: string
  result: string
  stack: string
  url: string
  textEn: string
  projectId: string | null
  coverPath: string | null
}

/* ───────────── Red flags ───────────── */

export const redFlagInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  /** How to recognise it in a job post / chat. */
  signs: z.string().max(20_000).default(''),
  /** What to do: skip, ask, raise price… */
  action: z.string().max(20_000).default(''),
  severity: z.number().int().min(1).max(3).default(2),
  ...withTagIds
})
export const redFlagPatchSchema = patchOf(redFlagInputSchema)
export type RedFlagInput = z.input<typeof redFlagInputSchema>
export type RedFlagPatch = z.input<typeof redFlagPatchSchema>

export interface RedFlag extends EntityBase, WithTags {
  title: string
  signs: string
  action: string
  severity: number
}

/* ───────────── Goals ───────────── */

export const GOAL_METRICS = [
  'net_income',
  'proposals',
  'replies',
  'contracts',
  'reply_rate',
  'hire_rate'
] as const
export type GoalMetric = (typeof GOAL_METRICS)[number]
export const GOAL_PERIODS = ['week', 'month'] as const
export type GoalPeriod = (typeof GOAL_PERIODS)[number]

export const goalInputSchema = z.object({
  title: z.string().trim().max(200).default(''),
  metric: z.enum(GOAL_METRICS),
  period: z.enum(GOAL_PERIODS).default('month'),
  target: z.number().min(0).max(100_000_000),
  /** null = all platforms. */
  platformId: idSchema.nullable().default(null),
  active: z.boolean().default(true)
})
export const goalPatchSchema = patchOf(goalInputSchema)
export type GoalInput = z.input<typeof goalInputSchema>
export type GoalPatch = z.input<typeof goalPatchSchema>

export interface Goal {
  id: string
  title: string
  metric: GoalMetric
  period: GoalPeriod
  target: number
  platformId: string | null
  active: boolean
  createdAt: number
}

export interface GoalProgress extends Goal {
  current: number
  /** 0..1 */
  ratio: number
  periodStart: number
  periodEnd: number
}

/* ───────────── Statistics ───────────── */

export interface FunnelRow {
  key: string
  label: string
  sent: number
  replied: number
  interview: number
  hired: number
  replyRate: number
  hireRate: number
  credits: number
}

export interface FreelanceStats {
  range: { from: number; to: number }
  totals: FunnelRow
  byNiche: FunnelRow[]
  byTemplate: FunnelRow[]
  byPlatform: FunnelRow[]
  /** Proposals sent per week for the range. */
  weekly: { week: string; sent: number; replied: number; hired: number }[]
  avgReplyHours: number | null
}

export const statsQuerySchema = z.object({
  platformId: idSchema.optional(),
  from: timestampSchema.optional(),
  to: timestampSchema.optional()
})
export type StatsQuery = z.infer<typeof statsQuerySchema>

/** Turns a won proposal into a CRM client + contract (project). */
export const hireSchema = z.object({
  proposalId: idSchema,
  /** Existing client or create a new one from proposal data. */
  clientId: idSchema.nullable().default(null),
  title: z.string().trim().min(1).max(300),
  billing: z.enum(['fixed', 'hourly']).default('fixed'),
  amount: z.number().min(0).max(100_000_000),
  feePercent: z.number().min(0).max(100)
})
export type HireInput = z.input<typeof hireSchema>
