/**
 * Job search: job boards with a daily habit, applications pipeline with interview stages
 * (synced to the calendar), companies, resume versions, and an interview question bank with SRS practice.
 */
import { z } from 'zod'
import {
  hexColorSchema,
  idSchema,
  patchOf,
  timestampSchema,
  urlSchema,
  withTagIds,
  type EntityBase,
  type WithTags
} from './common'
import { CURRENCIES, type Currency } from './crm'
import type { ReviewGrade } from './english'

/* ───────────── Job boards & daily check-ins ───────────── */

export const jobBoardInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: urlSchema.default(''),
  color: hexColorSchema.default(null),
  /** Applications per day to aim for; 0 = "just check it daily". */
  dailyTarget: z.number().int().min(0).max(100).default(1),
  /** Days of week it is tracked (0 = Sunday … 6 = Saturday). */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  active: z.boolean().default(true),
  notes: z.string().max(10_000).default('')
})
export const jobBoardPatchSchema = patchOf(jobBoardInputSchema)
export type JobBoardInput = z.input<typeof jobBoardInputSchema>
export type JobBoardPatch = z.input<typeof jobBoardPatchSchema>

export interface JobBoard {
  id: string
  name: string
  url: string
  color: string | null
  dailyTarget: number
  weekdays: number[]
  active: boolean
  notes: string
  position: number
  createdAt: number
  updatedAt: number
}

/** One board on one day: applications made + manual check mark. */
export interface BoardDay {
  boardId: string
  day: string // yyyy-mm-dd
  applied: number
  checked: boolean
  /** Target met: applied ≥ target, or manually checked. */
  done: boolean
  expected: boolean
}

export interface DailyBoard extends JobBoard {
  today: BoardDay
  /** Consecutive expected days done, ending today (or yesterday if today is not done yet). */
  streak: number
  history: BoardDay[]
}

export const checkinSchema = z.object({
  boardId: idSchema,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checked: z.boolean(),
  note: z.string().max(500).default('')
})
export type CheckinInput = z.input<typeof checkinSchema>

/* ───────────── Companies ───────────── */

export const companyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: urlSchema.default(''),
  /** DOU / Glassdoor / other reviews page. */
  reviewsUrl: urlSchema.default(''),
  stack: z.string().max(500).default(''),
  size: z.string().max(100).default(''),
  location: z.string().max(200).default(''),
  contacts: z.string().max(10_000).default(''),
  notes: z.string().max(100_000).default(''),
  /** Own impression 0–5. */
  rating: z.number().int().min(0).max(5).default(0),
  ...withTagIds
})
export const companyPatchSchema = patchOf(companyInputSchema)
export type CompanyInput = z.input<typeof companyInputSchema>
export type CompanyPatch = z.input<typeof companyPatchSchema>

export interface Company extends EntityBase, WithTags {
  name: string
  website: string
  reviewsUrl: string
  stack: string
  size: string
  location: string
  contacts: string
  notes: string
  rating: number
  applicationCount: number
  activeCount: number
}

/* ───────────── Resumes ───────────── */

export const resumeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** What changed compared to the previous version. */
  changes: z.string().max(20_000).default(''),
  isCurrent: z.boolean().default(false)
})
export const resumePatchSchema = patchOf(resumeInputSchema)
export type ResumeInput = z.input<typeof resumeInputSchema>
export type ResumePatch = z.input<typeof resumePatchSchema>

export interface Resume {
  id: string
  title: string
  changes: string
  isCurrent: boolean
  /** Relative path in the files folder. */
  filePath: string | null
  fileName: string
  mime: string
  size: number
  createdAt: number
  updatedAt: number
  /** Boards where this version is uploaded, with the date. */
  boards: { boardId: string; uploadedAt: number }[]
  sent: number
  replied: number
  replyRate: number
}

/* ───────────── Applications ───────────── */

export const APPLICATION_STATUSES = [
  'saved',
  'applied',
  'replied',
  'test',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'no_reply',
  'withdrawn'
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const WORK_FORMATS = ['remote', 'office', 'hybrid'] as const
export type WorkFormat = (typeof WORK_FORMATS)[number]

export const applicationInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  companyId: idSchema.nullable().default(null),
  /** Free text when the company card is not created yet. */
  companyName: z.string().max(200).default(''),
  boardId: idSchema.nullable().default(null),
  url: urlSchema.default(''),
  description: z.string().max(100_000).default(''),
  status: z.enum(APPLICATION_STATUSES).default('applied'),
  appliedAt: timestampSchema.nullable().default(null),
  salaryMin: z.number().min(0).max(10_000_000).nullable().default(null),
  salaryMax: z.number().min(0).max(10_000_000).nullable().default(null),
  currency: z.enum(CURRENCIES).default('USD'),
  format: z.enum(WORK_FORMATS).default('remote'),
  location: z.string().max(200).default(''),
  resumeId: idSchema.nullable().default(null),
  templateId: idSchema.nullable().default(null),
  coverLetter: z.string().max(50_000).default(''),
  contact: z.string().max(1000).default(''),
  /** When to follow up if there is no answer. */
  followUpAt: timestampSchema.nullable().default(null),
  notes: z.string().max(100_000).default(''),
  ...withTagIds
})
export const applicationPatchSchema = patchOf(applicationInputSchema)
export type ApplicationInput = z.input<typeof applicationInputSchema>
export type ApplicationPatch = z.input<typeof applicationPatchSchema>

export const applicationListQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  boardId: idSchema.optional(),
  companyId: idSchema.optional(),
  resumeId: idSchema.optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional()
})
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>

export interface Application extends EntityBase, WithTags {
  title: string
  companyId: string | null
  companyName: string
  boardId: string | null
  url: string
  description: string
  status: ApplicationStatus
  appliedAt: number | null
  salaryMin: number | null
  salaryMax: number | null
  currency: Currency
  format: WorkFormat
  location: string
  resumeId: string | null
  templateId: string | null
  coverLetter: string
  contact: string
  followUpAt: number | null
  notes: string
  repliedAt: number | null
  closedAt: number | null
  /** Resolved display name (company card name or free text). */
  company: string
  /** Next planned stage, if any. */
  nextStage: { id: string; kind: StageKind; at: number | null } | null
  stageCount: number
}

/* ───────────── Stages (interviews & test tasks) ───────────── */

export const STAGE_KINDS = ['screening', 'technical', 'test_task', 'hr', 'final', 'other'] as const
export type StageKind = (typeof STAGE_KINDS)[number]
export const STAGE_STATUSES = ['planned', 'done', 'passed', 'failed', 'cancelled'] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]

export const stageInputSchema = z.object({
  applicationId: idSchema,
  kind: z.enum(STAGE_KINDS).default('screening'),
  title: z.string().max(200).default(''),
  /** Interview start; for test tasks — when it was received. */
  at: timestampSchema.nullable().default(null),
  durationMin: z.number().int().min(0).max(24 * 60).default(60),
  /** Test task deadline. */
  deadlineAt: timestampSchema.nullable().default(null),
  status: z.enum(STAGE_STATUSES).default('planned'),
  /** Call link / address. */
  location: z.string().max(1000).default(''),
  /** How it went, what to improve. */
  notes: z.string().max(100_000).default(''),
  /** Interviewer names. */
  interviewers: z.string().max(1000).default('')
})
export const stagePatchSchema = patchOf(stageInputSchema.omit({ applicationId: true }))
export type StageInput = z.input<typeof stageInputSchema>
export type StagePatch = z.input<typeof stagePatchSchema>

export interface Stage {
  id: string
  applicationId: string
  kind: StageKind
  title: string
  at: number | null
  durationMin: number
  deadlineAt: number | null
  status: StageStatus
  location: string
  notes: string
  interviewers: string
  /** Calendar events created for this stage (interview time / test deadline). */
  eventId: string | null
  deadlineEventId: string | null
  createdAt: number
  updatedAt: number
}

export interface StageWithApplication extends Stage {
  applicationTitle: string
  company: string
}

export interface ApplicationDetails extends Application {
  stages: Stage[]
  questions: InterviewQuestion[]
}

/* ───────────── Interview question bank ───────────── */

export const QUESTION_CATEGORIES = ['technical', 'behavioral', 'company', 'salary', 'other'] as const
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number]
/** Main split shown in the UI: technical vs everything else (stored categories stay as they are). */
export const QUESTION_GROUPS = ['technical', 'nontechnical'] as const
export type QuestionGroup = (typeof QUESTION_GROUPS)[number]
export const NON_TECH_CATEGORIES = ['behavioral', 'company', 'salary', 'other'] as const satisfies readonly QuestionCategory[]
export const groupOf = (c: QuestionCategory): QuestionGroup => (c === 'technical' ? 'technical' : 'nontechnical')

export const questionInputSchema = z.object({
  category: z.enum(QUESTION_CATEGORIES).default('technical'),
  /** Topic inside the category: React, JS, System design, "О себе"… */
  topic: z.string().trim().max(100).default(''),
  question: z.string().trim().min(1).max(5000),
  /** My best answer (markdown). */
  answer: z.string().max(100_000).default(''),
  /** Language of the answer, for English interviews. */
  lang: z.enum(['ru', 'uk', 'en']).default('uk'),
  difficulty: z.number().int().min(1).max(3).default(2),
  /** Where it was asked (optional). */
  companyId: idSchema.nullable().default(null),
  applicationId: idSchema.nullable().default(null),
  ...withTagIds
})
export const questionPatchSchema = patchOf(questionInputSchema)
export type QuestionInput = z.input<typeof questionInputSchema>
export type QuestionPatch = z.input<typeof questionPatchSchema>

export const questionListQuerySchema = z.object({
  category: z.enum(QUESTION_CATEGORIES).optional(),
  group: z.enum(QUESTION_GROUPS).optional(),
  topic: z.string().max(100).optional(),
  companyId: idSchema.optional(),
  applicationId: idSchema.optional(),
  search: z.string().max(200).optional(),
  tagId: idSchema.optional()
})
export type QuestionListQuery = z.infer<typeof questionListQuerySchema>

export interface InterviewQuestion extends EntityBase, WithTags {
  category: QuestionCategory
  topic: string
  question: string
  answer: string
  lang: 'ru' | 'uk' | 'en'
  difficulty: number
  companyId: string | null
  applicationId: string | null
  /** SM-2 practice state (same algorithm as English). */
  ease: number
  intervalDays: number
  repetitions: number
  lapses: number
  dueAt: number
  lastReviewedAt: number | null
}

export const questionReviewSchema = z.object({
  id: idSchema,
  grade: z.number().int().min(0).max(3),
  /** Practice beyond the due queue: may bring a question back sooner, never pushes it later. */
  extra: z.boolean().optional()
})
export type QuestionReview = { id: string; grade: ReviewGrade }

/* ───────────── Stats ───────────── */

export interface JobFunnelRow {
  key: string
  label: string
  applied: number
  replied: number
  interview: number
  offer: number
  replyRate: number
  offerRate: number
}

export interface JobStats {
  range: { from: number; to: number }
  totals: JobFunnelRow
  byBoard: JobFunnelRow[]
  byResume: JobFunnelRow[]
  byTemplate: JobFunnelRow[]
  weekly: { week: string; applied: number; replied: number }[]
  avgReplyDays: number | null
  stagesByKind: { kind: StageKind; total: number; passed: number }[]
}

export interface JobsOverview {
  today: DailyBoard[]
  upcoming: StageWithApplication[]
  followUps: Application[]
  activeCount: number
  offers: number
  questionsDue: number
}
