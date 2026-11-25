import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { JobsApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import {
  applicationInputSchema,
  applicationListQuerySchema,
  applicationPatchSchema,
  stageInputSchema,
  stagePatchSchema,
  type Application,
  type ApplicationStatus,
  type StageKind,
  type StageWithApplication
} from '@shared/domain/jobs'
import { applications, applicationStages, companies, interviewQuestions } from '../../db/schema'
import type { Orm } from '../../db/client'
import { DAY_MS, newId, now, NotFoundError } from '../../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from '../context'
import type { StageCalendarSync } from './stage-calendar-sync'
import {
  applicationTitle,
  CLOSED,
  REPLIED,
  toStage,
  type AppRepo,
  type AppRow,
  type QuestionRepo,
  type StageRow
} from './shared'

type ApplicationsApi = Pick<
  JobsApi,
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'remove'
  | 'followUps'
  | 'addStage'
  | 'updateStage'
  | 'removeStage'
  | 'upcoming'
  | 'pastStages'
>

/** The applications pipeline: vacancies with status stamps and their interview stages. */
export class Applications {
  constructor(
    private readonly m: ModuleContext,
    private readonly apps: AppRepo,
    private readonly questions: QuestionRepo,
    private readonly sync: StageCalendarSync
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  /** Adds the company name, the next planned stage and the stage count. */
  enrich(list: Omit<Application, 'company' | 'nextStage' | 'stageCount'>[]): Application[] {
    if (!list.length) return []
    const ids = list.map((a) => a.id)
    const stages = this.db
      .select()
      .from(applicationStages)
      .where(inArray(applicationStages.applicationId, ids))
      .orderBy(asc(applicationStages.at))
      .all()
    const companyIds = [...new Set(list.map((a) => a.companyId).filter((x): x is string => !!x))]
    const names = new Map(
      companyIds.length
        ? this.db
            .select({ id: companies.id, name: companies.name })
            .from(companies)
            .where(inArray(companies.id, companyIds))
            .all()
            .map((c) => [c.id, c.name])
        : []
    )
    const t = now()
    return list.map((a) => {
      const mine = stages.filter((s) => s.applicationId === a.id)
      const next =
        mine.find(
          (s) =>
            s.status === 'planned' && ((s.at ?? 0) >= t - 2 * 3600_000 || (s.deadlineAt ?? 0) >= t)
        ) ?? mine.find((s) => s.status === 'planned')
      return {
        ...a,
        company: (a.companyId && names.get(a.companyId)) || a.companyName,
        nextStage: next
          ? { id: next.id, kind: next.kind as StageKind, at: next.at ?? next.deadlineAt }
          : null,
        stageCount: mine.length
      }
    })
  }

  /** Dates a status change implies: replied, closed (or reopened), applied. */
  private stamps(next: ApplicationStatus | undefined, current?: AppRow): Partial<AppRow> {
    if (!next) return {}
    const out: Partial<AppRow> = {}
    const ts = now()
    if (REPLIED.includes(next) && !current?.repliedAt) out.repliedAt = ts
    if (CLOSED.includes(next)) out.closedAt = current?.closedAt ?? ts
    else if (current?.closedAt) out.closedAt = null
    if (next !== 'saved' && !current?.appliedAt) out.appliedAt = ts
    return out
  }

  private one(id: string): Application {
    return this.enrich([this.apps.getOrThrow(id)])[0]
  }

  /** Open applications whose follow-up date passed or with no answer for 7+ days. */
  followUps(): Application[] {
    return this.enrich(
      this.apps.listWhere(
        [
          sql`${applications.closedAt} IS NULL`,
          sql`(${applications.followUpAt} <= ${now()} OR (${applications.status} = 'applied' AND ${applications.appliedAt} <= ${now() - 7 * DAY_MS}))`
        ],
        [asc(applications.appliedAt)],
        30
      )
    )
  }

  private withApplication(
    rows: { stage: StageRow; title: string; companyName: string; companyId: string | null }[]
  ): StageWithApplication[] {
    return rows.map((r) => ({
      ...toStage(r.stage),
      applicationTitle: r.title,
      company: r.companyId ? applicationTitle(this.db, r.stage.applicationId).company : r.companyName
    }))
  }

  upcomingStages(limit = 10): StageWithApplication[] {
    const t = now() - 2 * 3600_000
    const rows = this.db
      .select({
        stage: applicationStages,
        title: applications.title,
        companyName: applications.companyName,
        companyId: applications.companyId
      })
      .from(applicationStages)
      .innerJoin(applications, eq(applications.id, applicationStages.applicationId))
      .where(
        and(
          isNull(applications.deletedAt),
          eq(applicationStages.status, 'planned'),
          sql`(${applicationStages.at} >= ${t} OR ${applicationStages.deadlineAt} >= ${t})`
        )
      )
      .orderBy(sql`coalesce(${applicationStages.at}, ${applicationStages.deadlineAt})`)
      .limit(limit)
      .all()
    return this.withApplication(rows)
  }

  /** Past or finished stages (newest first) — interview history with outcomes. */
  pastStages(limit = 50): StageWithApplication[] {
    const t = now() - 2 * 3600_000
    const rows = this.db
      .select({
        stage: applicationStages,
        title: applications.title,
        companyName: applications.companyName,
        companyId: applications.companyId
      })
      .from(applicationStages)
      .innerJoin(applications, eq(applications.id, applicationStages.applicationId))
      .where(
        and(
          isNull(applications.deletedAt),
          sql`(${applicationStages.status} != 'planned' OR coalesce(${applicationStages.deadlineAt}, ${applicationStages.at}, ${t + 1}) < ${t})`
        )
      )
      .orderBy(
        sql`coalesce(${applicationStages.at}, ${applicationStages.deadlineAt}, ${applicationStages.createdAt}) DESC`
      )
      .limit(limit)
      .all()
    return this.withApplication(rows)
  }

  api(): ApplicationsApi {
    const apps = this.apps
    return {
      list: async (query) => {
        const q = applicationListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return this.enrich(
          apps.listWhere(
            [
              q.status ? eq(applications.status, q.status) : undefined,
              q.boardId ? eq(applications.boardId, q.boardId) : undefined,
              q.companyId ? eq(applications.companyId, q.companyId) : undefined,
              q.resumeId ? eq(applications.resumeId, q.resumeId) : undefined,
              apps.hasTag(q.tagId),
              apps.matches(q.search, [
                applications.title,
                applications.companyName,
                applications.notes,
                applications.description
              ])
            ],
            [sql`coalesce(${applications.appliedAt}, ${applications.createdAt}) DESC`],
            page.limit,
            page.offset
          )
        )
      },
      get: async (id) => {
        const a = apps.get(idArg.parse(id))
        if (!a) return null
        return {
          ...this.enrich([a])[0],
          stages: this.db
            .select()
            .from(applicationStages)
            .where(eq(applicationStages.applicationId, a.id))
            .orderBy(
              asc(
                sql`coalesce(${applicationStages.at}, ${applicationStages.deadlineAt}, ${applicationStages.createdAt})`
              )
            )
            .all()
            .map(toStage),
          questions: this.questions.listWhere(
            [eq(interviewQuestions.applicationId, a.id)],
            [asc(interviewQuestions.createdAt)]
          )
        }
      },
      create: async (input) => {
        const [data, tagIds] = splitTags(applicationInputSchema.parse(input))
        const created = apps.insert(
          {
            ...data,
            appliedAt: data.appliedAt ?? (data.status === 'saved' ? null : now()),
            repliedAt: null,
            closedAt: null,
            ...this.stamps(data.status)
          },
          tagIds
        )
        return this.one(created.id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(applicationPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        const current = apps.rowOrThrow(id)
        apps.patch(id, { ...data, ...this.stamps(data.status, current) }, tagIds)
        if (data.title !== undefined || data.companyId !== undefined || data.companyName !== undefined) {
          this.sync.syncAll(id)
        }
        return this.one(id)
      },
      remove: async (id) => {
        const appId = idArg.parse(id)
        apps.softDelete(appId)
        this.sync.remove(appId)
      },
      followUps: async () => this.followUps(),

      addStage: async (input) => {
        const data = stageInputSchema.parse(input)
        apps.rowOrThrow(data.applicationId)
        const ts = now()
        const row = this.db
          .insert(applicationStages)
          .values({
            ...data,
            id: newId(),
            eventId: null,
            deadlineEventId: null,
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
        this.sync.sync(row)
        const app = apps.rowOrThrow(data.applicationId)
        const nextStatus: ApplicationStatus = data.kind === 'test_task' ? 'test' : 'interview'
        if (!CLOSED.includes(app.status as ApplicationStatus) && app.status !== 'offer') {
          apps.patch(app.id, { status: nextStatus, ...this.stamps(nextStatus, app) })
        } else apps.touch(app.id)
        return toStage(this.db.select().from(applicationStages).where(eq(applicationStages.id, row.id)).get()!)
      },
      updateStage: async (args) => {
        const { id, patch } = updateArgs(stagePatchSchema).parse(args)
        const row = this.db
          .update(applicationStages)
          .set({ ...patch, updatedAt: now() })
          .where(eq(applicationStages.id, id))
          .returning()
          .get()
        if (!row) throw new NotFoundError('Етап', id)
        this.sync.sync(row)
        apps.touch(row.applicationId)
        return toStage(this.db.select().from(applicationStages).where(eq(applicationStages.id, id)).get()!)
      },
      removeStage: async (id) => {
        const row = this.db
          .select()
          .from(applicationStages)
          .where(eq(applicationStages.id, idArg.parse(id)))
          .get()
        if (!row) return
        this.sync.removeStageEvents(row)
        this.db.delete(applicationStages).where(eq(applicationStages.id, row.id)).run()
      },
      upcoming: async (limit) => this.upcomingStages(z.number().int().min(1).max(100).optional().parse(limit)),
      pastStages: async (limit) => this.pastStages(z.number().int().min(1).max(500).optional().parse(limit))
    }
  }
}
