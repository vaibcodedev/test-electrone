/**
 * Freelance: platforms (Upwork, Freelancehunt, direct…), proposals pipeline, bid credits (Connects),
 * message templates, portfolio cases, red flags and goals.
 * Clients and contracts are the shared CRM clients/projects with a `platformId`.
 */
import { z } from 'zod'
import { MAX } from './limits'
import {
  clientRatingSchema,
  clientSpentSchema,
  hexColorSchema,
  hireRateSchema,
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
  label: z.string().trim().min(1).max(MAX.name)
})
export type PreCheck = z.infer<typeof preCheckSchema>

export const platformInputSchema = z.object({
  name: z.string().trim().min(1).max(MAX.label),
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
  notes: z.string().max(MAX.note).default(''),
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

/** Proposal status as the UI writes it (main: search, pins, trash; renderer: the page). */
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Чернетка',
  sent: 'Надіслано',
  viewed: 'Переглянуто',
  replied: 'Відповіли',
  interview: 'Інтерв’ю',
  offer: 'Офер',
  hired: 'Контракт',
  declined: 'Відмова',
  no_reply: 'Без відповіді',
  withdrawn: 'Відкликано',
  closed: 'Вакансію закрито'
}

export const BID_TYPES = ['fixed', 'hourly'] as const
export type BidType = (typeof BID_TYPES)[number]

/** Upwork's own «Proposals» buckets on a job post, stored as these short strings. */
export const PROPOSAL_COUNTS = ['<5', '5–10', '10–15', '15–20', '20–50', '50+'] as const
export type ProposalCount = (typeof PROPOSAL_COUNTS)[number]

export const PROPOSAL_COUNT_LABEL: Record<ProposalCount, string> = {
  '<5': 'Менше 5',
  '5–10': '5–10',
  '10–15': '10–15',
  '15–20': '15–20',
  '20–50': '20–50',
  '50+': '50+'
}

/**
 * The bucket an old free-text value means — «20 to 50», «20-50», «Less than 5», «менше 5», «50+» — or null when it
 * matches none (it is then kept and shown as it was written).
 */
export function proposalCountOf(text: string): ProposalCount | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  if (/^(<\s*5|less than 5|менше 5|меньше 5|до 5)$/.test(t)) return '<5'
  if (/^50\s*\+$|^50 (or more|і більше|и более)$/.test(t)) return '50+'
  const m = /^(\d+)\s*(?:[-–—]|to|до)\s*(\d+)$/.exec(t)
  const pair = m ? `${m[1]}–${m[2]}` : ''
  return (PROPOSAL_COUNTS as readonly string[]).includes(pair) ? (pair as ProposalCount) : null
}

export const proposalInputSchema = z.object({
  platformId: idSchema,
  jobTitle: z.string().trim().min(1).max(MAX.title),
  jobUrl: urlSchema.default(''),
  jobDescription: z.string().max(MAX.jobPost).default(''),
  /** Type of task: "Next.js", "Вёрстка", "Боты"… (free text with suggestions). */
  niche: z.string().trim().max(MAX.label).default(''),
  status: z.enum(PROPOSAL_STATUSES).default('sent'),
  sentAt: timestampSchema.nullable().default(null),
  credits: z.number().int().min(0).max(1000).default(0),
  boostCredits: z.number().int().min(0).max(1000).default(0),
  bidType: z.enum(BID_TYPES).default('fixed'),
  /** One bid: an hourly rate or a fixed price (a million is far past any real job post). */
  bidAmount: z.number().min(0).max(1_000_000).default(0),
  /** Service fee % shown at bidding time (Upwork shows the exact one only then). */
  feePercent: z.number().min(0).max(100).nullable().default(null),
  coverLetter: z.string().max(MAX.letter).default(''),
  templateId: idSchema.nullable().default(null),
  clientId: idSchema.nullable().default(null),
  clientName: z.string().max(MAX.name).default(''),
  clientCountry: z.string().max(100).default(''),
  clientRating: clientRatingSchema.nullable().default(null),
  clientSpent: clientSpentSchema.nullable().default(null),
  clientHireRate: hireRateSchema.nullable().default(null),
  paymentVerified: z.boolean().nullable().default(null),
  /**
   * Competition shown on the job: one of Upwork's buckets, or '' — not set. A free text written before the choice
   * («20 to 50») stays in the record and is shown as it was; only a bucket can be saved now.
   */
  proposalsOnJob: z.union([z.enum(PROPOSAL_COUNTS), z.literal('')]).default(''),
  /** Ids of pre-checklist items that were ticked. */
  checks: z.array(z.string().max(40)).max(30).default([]),
  /** Marks a strong proposal worth reusing. */
  starred: z.boolean().default(false),
  notes: z.string().max(MAX.note).default(''),
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
  'cover_letter',
  'recruiter',
  'thank_you',
  'other'
] as const
export type TemplateSituation = (typeof TEMPLATE_SITUATIONS)[number]

/** Template situation as the UI writes it (main: search, pins, trash; renderer: the page). */
export const SITUATION_LABEL: Record<TemplateSituation, string> = {
  proposal: 'Відгук',
  first_message: 'Перше повідомлення',
  estimate: 'Оцінка термінів',
  tz_questions: 'Питання щодо ТЗ',
  revisions: 'Правки',
  follow_up: 'Нагадування',
  small_talk: 'Світська бесіда',
  closing: 'Завершення',
  cover_letter: 'Супровідний лист',
  recruiter: 'Відповідь рекрутеру',
  thank_you: 'Подяка після співбесіди',
  other: 'Інше'
}

/**
 * A template's situation: a built-in key (`TEMPLATE_SITUATIONS`) or the person's own text («Привітання HR»). Stored
 * as typed; main maps a built-in label («відгук») to its key and a case-only variant of an own one to its spelling.
 */
export const templateSituationSchema = z.string().trim().min(1).max(MAX.label)

export function isBuiltinSituation(s: string): s is TemplateSituation {
  return (TEMPLATE_SITUATIONS as readonly string[]).includes(s)
}


/** The built-in situation a typed text means — its key or its label in any case — or null for an own one. */
export function builtinSituationOf(text: string): TemplateSituation | null {
  const t = text.trim().toLocaleLowerCase('uk')
  return (
    TEMPLATE_SITUATIONS.find(
      (s) => s === t || SITUATION_LABEL[s].toLocaleLowerCase('uk') === t
    ) ?? null
  )
}

/**
 * What the UI writes for a situation: the built-in label (also for a label typed in another case, as the chat ШІ
 * may send it), or the person's own text as it is. Never undefined, unlike `SITUATION_LABEL[x]`.
 */
export function situationLabel(s: string): string {
  const builtin = isBuiltinSituation(s) ? s : builtinSituationOf(s)
  return builtin ? SITUATION_LABEL[builtin] : s
}

/**
 * «Для чого» a template is: freelance (proposals, clients), job search (applications, recruiters) or both. A
 * filter on the «Шаблони» page and in the pickers; «Будь-де» templates show up under either direction.
 */
export const TEMPLATE_PURPOSES = ['freelance', 'jobs', 'any'] as const
export type TemplatePurpose = (typeof TEMPLATE_PURPOSES)[number]
/** Directions of the page filter (and of the pickers): «Будь-де» is not one, it belongs to both. */
export const TEMPLATE_DIRECTIONS = ['freelance', 'jobs'] as const satisfies readonly TemplatePurpose[]
export type TemplateDirection = (typeof TEMPLATE_DIRECTIONS)[number]

export const PURPOSE_LABEL: Record<TemplatePurpose, string> = {
  freelance: 'Фриланс',
  jobs: 'Вакансії',
  any: 'Будь-де'
}

/**
 * The purpose a template gets when none is given (a new one, an old JSON import, a seed) — and the one the 0011
 * migration gave the templates that existed before the field. Keep in sync with `0011_template_purpose.sql`.
 */
export const SITUATION_PURPOSE: Record<TemplateSituation, TemplatePurpose> = {
  proposal: 'freelance',
  first_message: 'any',
  estimate: 'freelance',
  tz_questions: 'freelance',
  revisions: 'freelance',
  follow_up: 'any',
  small_talk: 'freelance',
  closing: 'freelance',
  cover_letter: 'jobs',
  recruiter: 'jobs',
  thank_you: 'jobs',
  other: 'any'
}

/** The template belongs to the direction: its own purpose or «Будь-де». */
export function purposeFits(purpose: TemplatePurpose, direction: TemplateDirection): boolean {
  return purpose === direction || purpose === 'any'
}

/** The purpose a situation implies: built-in ones by `SITUATION_PURPOSE`, an own one is never guessed — «Будь-де». */
export function purposeOfSituation(s: string): TemplatePurpose {
  return isBuiltinSituation(s) ? SITUATION_PURPOSE[s] : 'any'
}

/** A template input with its purpose filled in: the given one, or derived from the situation (create, seeds). */
export function withPurpose<T extends { situation: string; purpose?: TemplatePurpose }>(
  t: T
): T & { purpose: TemplatePurpose } {
  return { ...t, purpose: t.purpose ?? purposeOfSituation(t.situation) }
}

/* ── Text versions of a template (translations, a short variant…) ── */

/** All versions of one template, the first (`body`) included: enough for uk / ru / en and a few variants. */
export const TEMPLATE_VERSIONS_MAX = 8
/** Quick names offered for a version; any own name can be typed instead. */
export const VERSION_NAME_PRESETS = ['Українська', 'Русский', 'English'] as const
/** What an unnamed first version (every template from before versions) is called: never guessed from the text. */
export const DEFAULT_VERSION_NAME = 'Основна'

/** A further version: its own name and text (the first one is the template's `bodyName` + `body`). */
export const templateVersionSchema = z.object({
  name: z.string().trim().min(1).max(MAX.label),
  body: z.string().max(MAX.letter).default('')
})
export type TemplateVersion = z.output<typeof templateVersionSchema>

/** How a version is called in the UI. */
export function versionLabel(name: string): string {
  return name.trim() || DEFAULT_VERSION_NAME
}

/** Every version of a template in order, the first (`body`) included. */
export function templateVersions(t: {
  bodyName?: string
  body: string
  versions?: TemplateVersion[]
}): { name: string; body: string }[] {
  return [{ name: t.bodyName ?? '', body: t.body }, ...(t.versions ?? [])]
}

/** A name used twice in one template (in any case), as the UI shows it; null when all differ. */
export function duplicateVersionName(names: string[]): string | null {
  const seen = new Set<string>()
  for (const n of names) {
    const label = versionLabel(n)
    const key = label.toLocaleLowerCase('uk')
    if (seen.has(key)) return label
    seen.add(key)
  }
  return null
}

export const templateInputSchema = z.object({
  /** A built-in key or the person's own text (`templateSituationSchema`). */
  situation: templateSituationSchema.default('proposal'),
  /** «Для чого». Left out — derived from the situation (`SITUATION_PURPOSE`) on create; a patch never resets it. */
  purpose: z.enum(TEMPLATE_PURPOSES).optional(),
  title: z.string().trim().min(1).max(MAX.title),
  /** What the client says / when to use it (for small talk: the client's phrase). */
  trigger: z.string().max(MAX.short).default(''),
  /** Template text — the first version; {variables} are filled in when copying. */
  body: z.string().max(MAX.letter).default(''),
  /** Name of the first version («Українська»…); empty — «Основна». */
  bodyName: z.string().trim().max(MAX.label).default(''),
  /** Further versions after the first. Names are unique per template (checked by main, `duplicateVersionName`). */
  versions: z.array(templateVersionSchema).max(TEMPLATE_VERSIONS_MAX - 1).default([]),
  /** Native-language note: what it means / when not to use. */
  note: z.string().max(MAX.note).default(''),
  // No «Тип завдання» any more: the `niche` column keeps old values (search, export), nothing writes it.
  ...withTagIds
})
export const templatePatchSchema = patchOf(templateInputSchema)
export type TemplateInput = z.input<typeof templateInputSchema>
export type TemplatePatch = z.input<typeof templatePatchSchema>

export interface MessageTemplate extends EntityBase, WithTags {
  /** A built-in `TemplateSituation` or the person's own text: show it through `situationLabel`. */
  situation: string
  purpose: TemplatePurpose
  title: string
  trigger: string
  body: string
  bodyName: string
  versions: TemplateVersion[]
  note: string
  copyCount: number
  /** Proposals that used it, and how they went. */
  usedIn: number
  replied: number
  hired: number
}

/* ───────────── Portfolio cases ───────────── */

export const caseInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX.title),
  niche: z.string().max(MAX.label).default(''),
  client: z.string().max(MAX.name).default(''),
  problem: z.string().max(MAX.note).default(''),
  whatDone: z.string().max(MAX.article).default(''),
  result: z.string().max(MAX.note).default(''),
  stack: z.string().max(MAX.line).default(''),
  url: urlSchema.default(''),
  /** Ready-to-paste English text for the platform portfolio. */
  textEn: z.string().max(MAX.letter).default(''),
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
  title: z.string().trim().min(1).max(MAX.title),
  /** How to recognise it in a job post / chat. */
  signs: z.string().max(MAX.note).default(''),
  /** What to do: skip, ask, raise price… */
  action: z.string().max(MAX.note).default(''),
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
  title: z.string().trim().max(MAX.title).default(''),
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
  /**
   * Currency of `current` / `target` for money metrics (`net_income`), null otherwise.
   * Only payments in this currency are summed: the platform's currency, or — for a goal over all
   * platforms — the currency with the largest net income in the period.
   */
  currency: Currency | null
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
  title: z.string().trim().min(1).max(MAX.title),
  billing: z.enum(['fixed', 'hourly']).default('fixed'),
  amount: z.number().min(0).max(100_000_000),
  feePercent: z.number().min(0).max(100)
})
export type HireInput = z.input<typeof hireSchema>
