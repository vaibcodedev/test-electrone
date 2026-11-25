/** Types, labels and small helpers shared by the parts of the job search module. */
import { eq } from 'drizzle-orm'
import type {
  Application,
  ApplicationStatus,
  Company,
  InterviewQuestion,
  Stage,
  StageKind,
  StageStatus
} from '@shared/domain/jobs'
import type { Orm } from '../../db/client'
import { applications, applicationStages, companies, interviewQuestions } from '../../db/schema'
import type { SoftRepository } from '../../core/soft-repository'

export type AppRow = typeof applications.$inferSelect
export type CompanyRow = typeof companies.$inferSelect
export type QuestionRow = typeof interviewQuestions.$inferSelect
export type StageRow = typeof applicationStages.$inferSelect

export type AppRepo = SoftRepository<
  AppRow,
  Omit<Application, 'company' | 'nextStage' | 'stageCount'>
>
export type CompanyRepo = SoftRepository<
  CompanyRow,
  Omit<Company, 'applicationCount' | 'activeCount'>
>
export type QuestionRepo = SoftRepository<QuestionRow, InterviewQuestion>

/** `sourceType` of the calendar events that mirror a stage (interview / test task deadline). */
export const STAGE_SOURCE = 'job_stage'
export const STAGE_DEADLINE_SOURCE = 'job_stage_deadline'

export const STAGE_LABEL: Record<StageKind, string> = {
  screening: 'Скринінг',
  technical: 'Технічна',
  test_task: 'Тестове завдання',
  hr: 'HR',
  final: 'Фінальна',
  other: 'Етап'
}

export const REPLIED: ApplicationStatus[] = ['replied', 'test', 'interview', 'offer', 'accepted']
export const CLOSED: ApplicationStatus[] = ['accepted', 'rejected', 'no_reply', 'withdrawn']

export function toStage(r: StageRow): Stage {
  return { ...r, kind: r.kind as StageKind, status: r.status as StageStatus }
}

/** The vacancy title and its company name (the company card's name wins over the free text). */
export function applicationTitle(
  db: Orm,
  applicationId: string
): { title: string; company: string } {
  const a = db.select().from(applications).where(eq(applications.id, applicationId)).get()
  if (!a) return { title: '', company: '' }
  const company = a.companyId
    ? (db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, a.companyId))
        .get()?.name ?? a.companyName)
    : a.companyName
  return { title: a.title, company }
}
