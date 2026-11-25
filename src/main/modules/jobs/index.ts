/**
 * Job search backend: job boards with a daily habit, applications pipeline, interview stages synced
 * to calendar events (both directions), companies, resume versions with upload tracking, and a
 * question bank practised with the same SM-2 scheduler as English words. Each part lives in its own
 * file; this module owns the entity descriptors and assembles the JobsApi.
 */
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { JobsApi } from '@shared/api'
import { FEED_COLOR, type CalendarItem } from '@shared/domain/calendar'
import type { Currency } from '@shared/domain/crm'
import type {
  ApplicationStatus,
  JobBoard,
  QuestionCategory,
  WorkFormat
} from '@shared/domain/jobs'
import { applications, applicationStages, companies, interviewQuestions } from '../../db/schema'
import type { Orm } from '../../db/client'
import { SoftRepository } from '../../core/soft-repository'
import { seedOnce, type SeedLedger } from '../../core/config-store'
import type { EntityDescriptor } from '../../core/registry'
import { SRS_FIELDS } from '../../core/srs'
import type { ModuleContext } from '../context'
import type { CalendarModule } from '../calendar'
import { Applications } from './applications'
import { JobBoards } from './boards'
import { Companies } from './companies'
import { Questions } from './questions'
import { Resumes } from './resumes'
import { StageCalendarSync } from './stage-calendar-sync'
import { JobStatistics } from './stats'
import { STATUS_LABEL, type AppRepo, type CompanyRepo, type QuestionRepo } from './shared'

export { STAGE_DEADLINE_SOURCE, STAGE_SOURCE } from './shared'

export class JobsModule {
  readonly descriptors: EntityDescriptor[]
  private readonly appRepo: AppRepo
  private readonly companyRepo: CompanyRepo
  private readonly questionRepo: QuestionRepo
  private readonly sync: StageCalendarSync
  private readonly boards: JobBoards
  private readonly applications: Applications
  private readonly companies: Companies
  private readonly resumes: Resumes
  private readonly questions: Questions
  private readonly statistics: JobStatistics

  constructor(
    private readonly m: ModuleContext,
    calendar: CalendarModule
  ) {
    this.sync = new StageCalendarSync(m, calendar)
    const application: EntityDescriptor = {
      type: 'application',
      table: applications,
      searchDoc: (r) => ({
        title: r.title,
        body: `${r.companyName}\n${r.description}\n${r.coverLetter}\n${r.notes}\n${r.contact}`
      }),
      summary: (r) => ({
        title: r.title,
        subtitle: [r.companyName, STATUS_LABEL[r.status as ApplicationStatus]]
          .filter(Boolean)
          .join(' — ')
      }),
      // Stage events live and die with the vacancy: back from the trash together, deleted for good together.
      dependents: (id) => this.sync.eventIds(id).map((eid) => ({ type: 'event' as const, id: eid })),
      onRestore: (r) => this.sync.restore(r.id),
      // «Скасувати» after renaming the vacancy/company: event titles follow back.
      afterRevert: (r) => this.sync.syncAll(r.id),
      onPurge: (r) => this.sync.purge(r.id)
    }
    const company: EntityDescriptor = {
      type: 'company',
      table: companies,
      searchDoc: (r) => ({
        title: r.name,
        body: `${r.stack}\n${r.location}\n${r.contacts}\n${r.notes}`
      }),
      summary: (r) => ({ title: r.name, subtitle: r.stack || r.location || undefined })
    }
    const question: EntityDescriptor = {
      type: 'question',
      table: interviewQuestions,
      draft: { titleField: 'question', contentFields: ['topic', 'answer'] },
      searchDoc: (r) => ({ title: r.question, body: `${r.topic}\n${r.answer}` }),
      summary: (r) => ({ title: r.question.slice(0, 140), subtitle: r.topic || undefined }),
      systemFields: SRS_FIELDS
    }
    this.descriptors = [application, company, question]
    this.appRepo = new SoftRepository(m.repo, application, (r, tags) => ({
      ...r,
      status: r.status as ApplicationStatus,
      currency: r.currency as Currency,
      format: r.format as WorkFormat,
      tags
    }))
    this.companyRepo = new SoftRepository(m.repo, company, (r, tags) => ({ ...r, tags }))
    this.questionRepo = new SoftRepository(m.repo, question, (r, tags) => ({
      ...r,
      category: r.category as QuestionCategory,
      lang: r.lang as 'ru' | 'uk' | 'en',
      tags
    }))
    this.boards = new JobBoards(m)
    this.applications = new Applications(m, this.appRepo, this.questionRepo, this.sync)
    this.companies = new Companies(m, this.companyRepo)
    this.resumes = new Resumes(m)
    this.questions = new Questions(m, this.questionRepo)
    this.statistics = new JobStatistics(m, this.boards)
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  seedIfEmpty(ledger: SeedLedger): void {
    seedOnce(ledger, 'jobBoards', () => this.boards.hasAny(), () => this.boards.seed())
  }

  /** Startup housekeeping: stage events older versions left in the trash next to their vacancy. */
  tidy(): void {
    this.sync.untrashHiddenEvents()
  }

  /** Boards expected today that are not done yet (for the evening reminder). */
  pendingToday(): JobBoard[] {
    return this.boards.pendingToday()
  }

  /** Calendar feed: «нагадати про себе» dates of open vacancies. */
  calendarFeed(from: number, to: number): CalendarItem[] {
    return this.appRepo
      .listWhere([gte(applications.followUpAt, from), lte(applications.followUpAt, to), isNull(applications.closedAt)])
      .map((a) => ({
        key: `followup:${a.id}`,
        source: 'followup' as const,
        ref: { type: 'application' as const, id: a.id },
        title: `Нагадати про себе: ${a.title}${a.companyName ? ` — ${a.companyName}` : ''}`,
        startAt: a.followUpAt!,
        endAt: null,
        allDay: true,
        color: FEED_COLOR.followup,
        done: false
      }))
  }

  applicationOfStage(stageId: string): string | null {
    return (
      this.db
        .select({ a: applicationStages.applicationId })
        .from(applicationStages)
        .where(eq(applicationStages.id, stageId))
        .get()?.a ?? null
    )
  }

  private count(where: ReturnType<typeof and>): number {
    return this.db.select({ c: sql<number>`count(*)` }).from(applications).where(where).get()?.c ?? 0
  }

  api(): JobsApi {
    return {
      ...this.boards.api(),
      ...this.applications.api(),
      ...this.companies.api(),
      ...this.resumes.api(),
      ...this.questions.api(),
      stats: async (args) =>
        this.statistics.stats(z.object({ from: z.number().optional(), to: z.number().optional() }).parse(args ?? {})),
      overview: async () => ({
        today: this.boards.daily(28),
        upcoming: this.applications.upcomingStages(6),
        followUps: this.applications.followUps(),
        activeCount: this.count(
          and(isNull(applications.deletedAt), isNull(applications.closedAt), sql`${applications.status} != 'saved'`)
        ),
        offers: this.count(and(isNull(applications.deletedAt), eq(applications.status, 'offer'))),
        questionsDue: this.questions.due()
      })
    }
  }
}
