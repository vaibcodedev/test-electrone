import { pageSchema } from '@shared/domain/common'
/**
 * Job search backend: job boards with a daily habit, applications pipeline, interview stages synced
 * to calendar events (both directions), companies, resume versions with upload tracking, and a
 * question bank practised with the same SM-2 scheduler as English words.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, max, sql, ne, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import type { JobsApi } from '@shared/api'
import {
  APPLICATION_STATUSES,
  applicationInputSchema,
  applicationListQuerySchema,
  applicationPatchSchema,
  checkinSchema,
  companyInputSchema,
  companyPatchSchema,
  jobBoardInputSchema,
  jobBoardPatchSchema,
  questionInputSchema,
  questionListQuerySchema,
  questionPatchSchema,
  questionReviewSchema,
  resumeInputSchema,
  resumePatchSchema,
  stageInputSchema,
  stagePatchSchema,
  type Application,
  type ApplicationStatus,
  type BoardDay,
  type Company,
  type DailyBoard,
  type InterviewQuestion,
  type JobBoard,
  type JobFunnelRow,
  type JobStats,
  type QuestionCategory,
  type Resume,
  type Stage,
  type StageKind,
  type StageStatus,
  type StageWithApplication,
  type WorkFormat
} from '@shared/domain/jobs'
import { fileSourceSchema } from '@shared/domain/designs'
import type { Currency } from '@shared/domain/crm'
import type { ReviewGrade } from '@shared/domain/english'
import {
  applications,
  applicationStages,
  boardCheckins,
  companies,
  events,
  interviewQuestions,
  jobBoards,
  messageTemplates,
  resumeBoards,
  resumes
} from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { DAY_MS, newId, now, NotFoundError, startOfDay, startOfWeek } from '../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'
import { schedule } from './english'
import type { CalendarModule } from './calendar'

type AppRow = typeof applications.$inferSelect
type CompanyRow = typeof companies.$inferSelect
type QuestionRow = typeof interviewQuestions.$inferSelect
type StageRow = typeof applicationStages.$inferSelect

export const STAGE_SOURCE = 'job_stage'
export const STAGE_DEADLINE_SOURCE = 'job_stage_deadline'

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: 'Збережено',
  applied: 'Надіслано',
  replied: 'Відповіли',
  test: 'Тестове',
  interview: 'Співбесіда',
  offer: 'Офер',
  accepted: 'Прийняв',
  rejected: 'Відмова',
  no_reply: 'Немає відповіді',
  withdrawn: 'Відкликав'
}

export const STAGE_LABEL: Record<StageKind, string> = {
  screening: 'Скринінг',
  technical: 'Технічна',
  test_task: 'Тестове завдання',
  hr: 'HR',
  final: 'Фінальна',
  other: 'Етап'
}

const REPLIED: ApplicationStatus[] = ['replied', 'test', 'interview', 'offer', 'accepted']
const CLOSED: ApplicationStatus[] = ['accepted', 'rejected', 'no_reply', 'withdrawn']
const INTERVIEW_COLOR = '#7c8cf8'
const DEADLINE_COLOR = '#f5a524'

export const dayKey = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 1000) / 10 : 0)

export class JobsModule {
  readonly descriptors: EntityDescriptor[]
  readonly appRepo: SoftRepository<
    AppRow,
    Omit<Application, 'company' | 'nextStage' | 'stageCount'>
  >
  private readonly companyRepo: SoftRepository<
    CompanyRow,
    Omit<Company, 'applicationCount' | 'activeCount'>
  >
  private readonly questionRepo: SoftRepository<QuestionRow, InterviewQuestion>

  constructor(
    private readonly m: ModuleContext,
    private readonly calendar: CalendarModule
  ) {
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
      onPurge: (r) => this.removeStageEvents(r.id)
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
      summary: (r) => ({ title: r.question.slice(0, 140), subtitle: r.topic || undefined })
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
    // Moving/renaming an interview in the calendar updates the stage.
    calendar.onEventChanged((e) => this.syncFromEvent(e))
  }

  private get db() {
    return this.m.db.orm
  }

  /* ───────── seeds ───────── */

  seedIfEmpty(): void {
    if (this.db.select({ id: jobBoards.id }).from(jobBoards).limit(1).get()) return
    const ts = now()
    const seed = [
      { name: 'Djinni', url: 'https://djinni.co/jobs/', color: '#3ec5a5', dailyTarget: 2 },
      { name: 'DOU', url: 'https://jobs.dou.ua/', color: '#5aa9f0', dailyTarget: 1 },
      { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs/', color: '#0a66c2', dailyTarget: 1 },
      { name: 'Work.ua', url: 'https://www.work.ua/jobs-it/', color: '#e05a4f', dailyTarget: 0 }
    ]
    seed.forEach((b, i) =>
      this.db
        .insert(jobBoards)
        .values({
          ...jobBoardInputSchema.parse(b),
          id: newId(),
          position: i,
          createdAt: ts,
          updatedAt: ts
        })
        .run()
    )
  }

  /* ───────── boards & daily habit ───────── */

  private toBoard(r: typeof jobBoards.$inferSelect): JobBoard {
    return { ...r }
  }

  boards(includeInactive = false): JobBoard[] {
    return this.db
      .select()
      .from(jobBoards)
      .where(includeInactive ? undefined : eq(jobBoards.active, true))
      .orderBy(asc(jobBoards.position))
      .all()
      .map((r) => this.toBoard(r))
  }

  /** Board × day matrix for the last `days` days (today included). */
  daily(days = 28): DailyBoard[] {
    const today = startOfDay(now())
    const from = today - (days - 1) * DAY_MS
    const list = this.boards()
    if (!list.length) return []
    const applied = this.db
      .select({ boardId: applications.boardId, at: applications.appliedAt })
      .from(applications)
      .where(
        and(
          isNull(applications.deletedAt),
          isNotNull(applications.boardId),
          gte(applications.appliedAt, from)
        )
      )
      .all()
    const checks = this.db
      .select()
      .from(boardCheckins)
      .where(gte(boardCheckins.day, dayKey(from)))
      .all()
    return list.map((b) => {
      const history: BoardDay[] = []
      for (let ts = from; ts <= today; ts += DAY_MS) {
        const day = dayKey(ts)
        const n = applied.filter((a) => a.boardId === b.id && a.at && dayKey(a.at) === day).length
        const checked = checks.some((c) => c.boardId === b.id && c.day === day)
        const expected = b.weekdays.includes(new Date(ts).getDay())
        const done = checked || (b.dailyTarget > 0 ? n >= b.dailyTarget : n > 0)
        history.push({ boardId: b.id, day, applied: n, checked, done, expected })
      }
      const todayEntry = history[history.length - 1]
      let streak = 0
      for (let i = history.length - 1 - (todayEntry.done ? 0 : 1); i >= 0; i--) {
        const h = history[i]
        if (!h.expected) continue
        if (!h.done) break
        streak++
      }
      return { ...b, today: todayEntry, streak, history }
    })
  }

  /** Boards expected today that are not done yet (for the evening reminder). */
  pendingToday(): JobBoard[] {
    return this.daily(1).filter((b) => b.today.expected && !b.today.done)
  }

  /* ───────── calendar sync ───────── */

  private appTitle(applicationId: string): { title: string; company: string } {
    const a = this.db.select().from(applications).where(eq(applications.id, applicationId)).get()
    if (!a) return { title: '', company: '' }
    const company = a.companyId
      ? (this.db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, a.companyId))
          .get()?.name ?? a.companyName)
      : a.companyName
    return { title: a.title, company }
  }

  /** Creates/updates/removes the calendar events that mirror a stage. */
  private syncStageEvents(stage: StageRow): void {
    const { title, company } = this.appTitle(stage.applicationId)
    const label = stage.title || STAGE_LABEL[stage.kind as StageKind]
    const who = company || title
    const cancelled = stage.status === 'cancelled'
    const upsert = (
      eventId: string | null,
      want: boolean,
      values: {
        title: string
        startAt: number
        endAt: number | null
        allDay: boolean
        color: string
        source: string
      }
    ): string | null => {
      if (!want) {
        if (eventId) this.calendar.repo.softDelete(eventId)
        return null
      }
      const existing = eventId ? this.calendar.repo.row(eventId) : undefined
      const data = {
        title: values.title,
        description: `${title}${company ? ` — ${company}` : ''}\n${stage.location}`.trim(),
        startAt: values.startAt,
        endAt: values.endAt,
        allDay: values.allDay,
        color: values.color
      }
      if (existing) {
        const timeChanged = existing.startAt !== values.startAt
        this.calendar.repo.patch(existing.id, {
          ...data,
          ...(timeChanged ? { remindedFor: null, reminded2For: null } : {})
        })
        return existing.id
      }
      return this.calendar.repo.insert({
        ...data,
        remindMinutes: values.allDay ? 0 : 60,
        remind2Minutes: values.allDay ? 24 * 60 : 24 * 60,
        recurrence: 'none',
        remindedFor: null,
        reminded2For: null,
        sourceType: values.source,
        sourceId: stage.id
      }).id
    }
    const eventId = upsert(stage.eventId, !!stage.at && !cancelled && stage.kind !== 'test_task', {
      title: `${label}: ${who}`,
      startAt: stage.at ?? 0,
      endAt: stage.at ? stage.at + stage.durationMin * 60_000 : null,
      allDay: false,
      color: INTERVIEW_COLOR,
      source: STAGE_SOURCE
    })
    const deadlineEventId = upsert(
      stage.deadlineEventId,
      !!stage.deadlineAt && !cancelled && stage.status === 'planned',
      {
        title: `Здати тестове: ${who}`,
        startAt: stage.deadlineAt ?? 0,
        endAt: null,
        allDay: false,
        color: DEADLINE_COLOR,
        source: STAGE_DEADLINE_SOURCE
      }
    )
    if (eventId !== stage.eventId || deadlineEventId !== stage.deadlineEventId) {
      this.db
        .update(applicationStages)
        .set({ eventId, deadlineEventId })
        .where(eq(applicationStages.id, stage.id))
        .run()
    }
  }

  /** Calendar → stage: the user moved the event in the calendar. */
  private syncFromEvent(e: {
    id: string
    sourceType: string | null
    sourceId: string | null
    startAt: number
    endAt: number | null
  }): void {
    if (!e.sourceId || (e.sourceType !== STAGE_SOURCE && e.sourceType !== STAGE_DEADLINE_SOURCE))
      return
    const stage = this.db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, e.sourceId))
      .get()
    if (!stage) return
    const patch =
      e.sourceType === STAGE_SOURCE
        ? {
            at: e.startAt,
            durationMin: e.endAt
              ? Math.max(15, Math.round((e.endAt - e.startAt) / 60_000))
              : stage.durationMin
          }
        : { deadlineAt: e.startAt }
    this.db
      .update(applicationStages)
      .set({ ...patch, updatedAt: now() })
      .where(eq(applicationStages.id, stage.id))
      .run()
  }

  private removeStageEvents(applicationId: string): void {
    const stages = this.db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.applicationId, applicationId))
      .all()
    for (const s of stages) {
      for (const id of [s.eventId, s.deadlineEventId])
        if (id && this.calendar.repo.row(id)) this.calendar.repo.softDelete(id)
    }
  }

  /* ───────── applications ───────── */

  private enrich(list: Omit<Application, 'company' | 'nextStage' | 'stageCount'>[]): Application[] {
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

  private toStage(r: StageRow): Stage {
    return { ...r, kind: r.kind as StageKind, status: r.status as StageStatus }
  }

  /* ───────── resumes ───────── */

  private resumeList(): Resume[] {
    const rows = this.db.select().from(resumes).orderBy(desc(resumes.createdAt)).all()
    const uploads = this.db.select().from(resumeBoards).all()
    const stats = this.db
      .select({
        resumeId: applications.resumeId,
        sent: sql<number>`count(*)`,
        replied: sql<number>`sum(CASE WHEN ${applications.repliedAt} IS NOT NULL THEN 1 ELSE 0 END)`
      })
      .from(applications)
      .where(
        and(
          isNull(applications.deletedAt),
          isNotNull(applications.resumeId),
          sql`${applications.status} != 'saved'`
        )
      )
      .groupBy(applications.resumeId)
      .all()
    return rows.map((r) => {
      const s = stats.find((x) => x.resumeId === r.id)
      return {
        ...r,
        boards: uploads
          .filter((u) => u.resumeId === r.id)
          .map((u) => ({ boardId: u.boardId, uploadedAt: u.uploadedAt })),
        sent: s?.sent ?? 0,
        replied: s?.replied ?? 0,
        replyRate: pct(s?.replied ?? 0, s?.sent ?? 0)
      }
    })
  }

  /* ───────── stats ───────── */

  private funnel(key: string, label: string, rows: AppRow[], stageApps: Set<string>): JobFunnelRow {
    const sent = rows.filter((r) => r.status !== 'saved')
    const replied = sent.filter(
      (r) => r.repliedAt !== null || REPLIED.includes(r.status as ApplicationStatus)
    ).length
    const interview = sent.filter(
      (r) => stageApps.has(r.id) || ['interview', 'offer', 'accepted'].includes(r.status)
    ).length
    const offer = sent.filter((r) => r.status === 'offer' || r.status === 'accepted').length
    return {
      key,
      label,
      applied: sent.length,
      replied,
      interview,
      offer,
      replyRate: pct(replied, sent.length),
      offerRate: pct(offer, sent.length)
    }
  }

  stats(q: { from?: number; to?: number }): JobStats {
    const to = q.to ?? now()
    const from = q.from ?? startOfDay(to) - 89 * DAY_MS
    const rows = this.db
      .select()
      .from(applications)
      .where(
        and(
          isNull(applications.deletedAt),
          gte(sql`coalesce(${applications.appliedAt}, ${applications.createdAt})`, from),
          lte(sql`coalesce(${applications.appliedAt}, ${applications.createdAt})`, to)
        )
      )
      .all()
    const stages = rows.length
      ? this.db
          .select()
          .from(applicationStages)
          .where(
            inArray(
              applicationStages.applicationId,
              rows.map((r) => r.id)
            )
          )
          .all()
      : []
    const interviewApps = new Set(
      stages.filter((s) => s.kind !== 'test_task').map((s) => s.applicationId)
    )
    const boardNames = new Map(this.boards(true).map((b) => [b.id, b.name]))
    const resumeNames = new Map(
      this.db
        .select({ id: resumes.id, title: resumes.title })
        .from(resumes)
        .all()
        .map((r) => [r.id, r.title])
    )
    const templateNames = new Map(
      this.db
        .select({ id: messageTemplates.id, title: messageTemplates.title })
        .from(messageTemplates)
        .all()
        .map((t) => [t.id, t.title])
    )
    const group = (
      keyOf: (r: AppRow) => string,
      labelOf: (k: string) => string
    ): JobFunnelRow[] => {
      const map = new Map<string, AppRow[]>()
      for (const r of rows) map.set(keyOf(r), [...(map.get(keyOf(r)) ?? []), r])
      return [...map.entries()]
        .map(([k, list]) => this.funnel(k, labelOf(k), list, interviewApps))
        .filter((f) => f.applied > 0)
        .sort((a, b) => b.applied - a.applied)
    }
    const weeks = new Map<number, { applied: number; replied: number }>()
    for (let w = startOfWeek(from); w <= to; w += 7 * DAY_MS)
      weeks.set(w, { applied: 0, replied: 0 })
    for (const r of rows) {
      if (r.status === 'saved') continue
      const b = weeks.get(startOfWeek(r.appliedAt ?? r.createdAt))
      if (!b) continue
      b.applied++
      if (r.repliedAt) b.replied++
    }
    const replyDays = rows
      .filter((r) => r.repliedAt && r.appliedAt)
      .map((r) => (r.repliedAt! - r.appliedAt!) / DAY_MS)
    const kinds = new Map<StageKind, { total: number; passed: number }>()
    for (const s of stages) {
      const k = kinds.get(s.kind as StageKind) ?? { total: 0, passed: 0 }
      k.total++
      if (s.status === 'passed') k.passed++
      kinds.set(s.kind as StageKind, k)
    }
    return {
      range: { from, to },
      totals: this.funnel('all', 'Усі', rows, interviewApps),
      byBoard: group(
        (r) => r.boardId ?? '—',
        (k) => boardNames.get(k) ?? 'Без майданчика'
      ),
      byResume: group(
        (r) => r.resumeId ?? '—',
        (k) => resumeNames.get(k) ?? 'Без резюме'
      ),
      byTemplate: group(
        (r) => r.templateId ?? '—',
        (k) => templateNames.get(k) ?? 'Без шаблону'
      ),
      weekly: [...weeks.entries()].map(([w, v]) => ({
        week: new Date(w).toISOString().slice(0, 10),
        ...v
      })),
      avgReplyDays: replyDays.length
        ? Math.round((replyDays.reduce((s, x) => s + x, 0) / replyDays.length) * 10) / 10
        : null,
      stagesByKind: [...kinds.entries()].map(([kind, v]) => ({ kind, ...v }))
    }
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
    return rows.map((r) => ({
      ...this.toStage(r.stage),
      applicationTitle: r.title,
      company: r.companyId ? this.appTitle(r.stage.applicationId).company : r.companyName
    }))
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
    return rows.map((r) => ({
      ...this.toStage(r.stage),
      applicationTitle: r.title,
      company: r.companyId ? this.appTitle(r.stage.applicationId).company : r.companyName
    }))
  }

  questionsDue(): number {
    return (
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(interviewQuestions)
        .where(and(isNull(interviewQuestions.deletedAt), lte(interviewQuestions.dueAt, now())))
        .get()?.c ?? 0
    )
  }

  /* ───────── API ───────── */

  api(): JobsApi {
    const apps = this.appRepo
    const qs = this.questionRepo
    const cos = this.companyRepo
    const appOne = (id: string): Application => this.enrich([apps.getOrThrow(id)])[0]
    const companyWithCounts = (
      list: Omit<Company, 'applicationCount' | 'activeCount'>[]
    ): Company[] => {
      if (!list.length) return []
      const counts = this.db
        .select({
          companyId: applications.companyId,
          total: sql<number>`count(*)`,
          active: sql<number>`sum(CASE WHEN ${applications.closedAt} IS NULL THEN 1 ELSE 0 END)`
        })
        .from(applications)
        .where(
          and(
            isNull(applications.deletedAt),
            inArray(
              applications.companyId,
              list.map((c) => c.id)
            )
          )
        )
        .groupBy(applications.companyId)
        .all()
      return list.map((c) => {
        const k = counts.find((x) => x.companyId === c.id)
        return { ...c, applicationCount: k?.total ?? 0, activeCount: k?.active ?? 0 }
      })
    }

    return {
      /* boards */
      boards: async (args) =>
        this.boards(
          z.object({ includeInactive: z.boolean().optional() }).parse(args ?? {}).includeInactive
        ),
      createBoard: async (input) => {
        const data = jobBoardInputSchema.parse(input)
        const last = this.db
          .select({ m: max(jobBoards.position) })
          .from(jobBoards)
          .get()
        const ts = now()
        return this.toBoard(
          this.db
            .insert(jobBoards)
            .values({
              ...data,
              id: newId(),
              position: (last?.m ?? 0) + 1,
              createdAt: ts,
              updatedAt: ts
            })
            .returning()
            .get()
        )
      },
      updateBoard: async (args) => {
        const { id, patch } = updateArgs(jobBoardPatchSchema).parse(args)
        const row = this.db
          .update(jobBoards)
          .set({ ...patch, updatedAt: now() })
          .where(eq(jobBoards.id, id))
          .returning()
          .get()
        if (!row) throw new NotFoundError('Майданчик', id)
        return this.toBoard(row)
      },
      reorderBoards: async (ids) => {
        const list = z.array(idArg).parse(ids)
        this.m.db.tx(() =>
          list.forEach((id, i) =>
            this.db.update(jobBoards).set({ position: i }).where(eq(jobBoards.id, id)).run()
          )
        )
      },
      daily: async (args) =>
        this.daily(
          z.object({ days: z.number().int().min(1).max(370).optional() }).parse(args ?? {}).days
        ),
      checkin: async (input) => {
        const data = checkinSchema.parse(input)
        this.db
          .delete(boardCheckins)
          .where(and(eq(boardCheckins.boardId, data.boardId), eq(boardCheckins.day, data.day)))
          .run()
        if (data.checked)
          this.db
            .insert(boardCheckins)
            .values({ ...data, createdAt: now() })
            .run()
      },

      /* applications */
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
            .map((s) => this.toStage(s)),
          questions: qs.listWhere(
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
        return appOne(created.id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(applicationPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        const current = apps.rowOrThrow(id)
        apps.patch(id, { ...data, ...this.stamps(data.status, current) }, tagIds)
        if (
          data.title !== undefined ||
          data.companyId !== undefined ||
          data.companyName !== undefined
        ) {
          for (const s of this.db
            .select()
            .from(applicationStages)
            .where(eq(applicationStages.applicationId, id))
            .all()) {
            this.syncStageEvents(s)
          }
        }
        return appOne(id)
      },
      remove: async (id) => {
        const appId = idArg.parse(id)
        apps.softDelete(appId)
        this.removeStageEvents(appId)
      },
      followUps: async () =>
        this.enrich(
          apps.listWhere(
            [
              sql`${applications.closedAt} IS NULL`,
              sql`(${applications.followUpAt} <= ${now()} OR (${applications.status} = 'applied' AND ${applications.appliedAt} <= ${now() - 7 * DAY_MS}))`
            ],
            [asc(applications.appliedAt)],
            30
          )
        ),

      /* stages */
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
        this.syncStageEvents(row)
        const app = apps.rowOrThrow(data.applicationId)
        const nextStatus: ApplicationStatus = data.kind === 'test_task' ? 'test' : 'interview'
        if (!CLOSED.includes(app.status as ApplicationStatus) && app.status !== 'offer') {
          apps.patch(app.id, { status: nextStatus, ...this.stamps(nextStatus, app) })
        } else apps.touch(app.id)
        return this.toStage(
          this.db.select().from(applicationStages).where(eq(applicationStages.id, row.id)).get()!
        )
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
        this.syncStageEvents(row)
        apps.touch(row.applicationId)
        return this.toStage(
          this.db.select().from(applicationStages).where(eq(applicationStages.id, id)).get()!
        )
      },
      removeStage: async (id) => {
        const row = this.db
          .select()
          .from(applicationStages)
          .where(eq(applicationStages.id, idArg.parse(id)))
          .get()
        if (!row) return
        for (const e of [row.eventId, row.deadlineEventId])
          if (e && this.calendar.repo.row(e)) this.calendar.repo.softDelete(e)
        this.db.delete(applicationStages).where(eq(applicationStages.id, row.id)).run()
      },
      upcoming: async (limit) =>
        this.upcomingStages(z.number().int().min(1).max(100).optional().parse(limit)),
      pastStages: async (limit) =>
        this.pastStages(z.number().int().min(1).max(500).optional().parse(limit)),

      /* companies */
      companies: async (query) => {
        const q = z.object({ search: z.string().max(200).optional() }).parse(query ?? {})
        return companyWithCounts(
          cos.listWhere(
            [cos.matches(q.search, [companies.name, companies.stack, companies.notes])],
            [asc(companies.name)]
          )
        )
      },
      company: async (id) => {
        const c = cos.get(idArg.parse(id))
        return c ? companyWithCounts([c])[0] : null
      },
      createCompany: async (input) => {
        const [data, tagIds] = splitTags(companyInputSchema.parse(input))
        return companyWithCounts([cos.insert(data, tagIds)])[0]
      },
      updateCompany: async (args) => {
        const { id, patch } = updateArgs(companyPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return companyWithCounts([cos.patch(id, data, tagIds)])[0]
      },
      removeCompany: async (id) => cos.softDelete(idArg.parse(id)),

      /* resumes */
      resumes: async () => this.resumeList(),
      createResume: async (args) => {
        const { input, source } = z
          .object({ input: resumeInputSchema, source: fileSourceSchema.optional() })
          .parse(args)
        const stored = source ? await this.m.files.import(source) : null
        const ts = now()
        const id = newId()
        this.m.db.tx(() => {
          if (input.isCurrent) this.db.update(resumes).set({ isCurrent: false }).run()
          this.db
            .insert(resumes)
            .values({
              ...input,
              id,
              filePath: stored?.path ?? null,
              fileName: stored?.originalName ?? '',
              mime: stored?.mime ?? '',
              size: stored?.size ?? 0,
              createdAt: ts,
              updatedAt: ts
            })
            .run()
        })
        return this.resumeList().find((r) => r.id === id)!
      },
      updateResume: async (args) => {
        const { id, patch } = updateArgs(resumePatchSchema).parse(args)
        this.m.db.tx(() => {
          if (patch.isCurrent) this.db.update(resumes).set({ isCurrent: false }).run()
          this.db
            .update(resumes)
            .set({ ...patch, updatedAt: now() })
            .where(eq(resumes.id, id))
            .run()
        })
        const r = this.resumeList().find((x) => x.id === id)
        if (!r) throw new NotFoundError('Резюме', id)
        return r
      },
      replaceResumeFile: async (args) => {
        const { id, source } = z.object({ id: idArg, source: fileSourceSchema }).parse(args)
        const cur = this.db.select().from(resumes).where(eq(resumes.id, id)).get()
        if (!cur) throw new NotFoundError('Резюме', id)
        const stored = await this.m.files.import(source)
        this.db
          .update(resumes)
          .set({
            filePath: stored.path,
            fileName: stored.originalName,
            mime: stored.mime,
            size: stored.size,
            updatedAt: now()
          })
          .where(eq(resumes.id, id))
          .run()
        this.m.files.remove(cur.filePath)
        return this.resumeList().find((r) => r.id === id)!
      },
      removeResume: async (id) => {
        const cur = this.db
          .select()
          .from(resumes)
          .where(eq(resumes.id, idArg.parse(id)))
          .get()
        if (!cur) return
        this.db.delete(resumeBoards).where(eq(resumeBoards.resumeId, cur.id)).run()
        this.db.delete(resumes).where(eq(resumes.id, cur.id)).run()
        this.m.files.remove(cur.filePath)
      },
      setResumeUploaded: async (args) => {
        const { resumeId, boardId, uploaded } = z
          .object({ resumeId: idArg, boardId: idArg, uploaded: z.boolean() })
          .parse(args)
        this.db
          .delete(resumeBoards)
          .where(and(eq(resumeBoards.resumeId, resumeId), eq(resumeBoards.boardId, boardId)))
          .run()
        if (uploaded)
          this.db.insert(resumeBoards).values({ resumeId, boardId, uploadedAt: now() }).run()
      },

      /* questions */
      questions: async (query) => {
        const q = questionListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return qs.listWhere(
          [
            q.category ? eq(interviewQuestions.category, q.category) : undefined,
            q.group === 'technical'
              ? eq(interviewQuestions.category, 'technical')
              : q.group === 'nontechnical'
                ? ne(interviewQuestions.category, 'technical')
                : undefined,
            q.topic ? eq(interviewQuestions.topic, q.topic) : undefined,
            q.companyId ? eq(interviewQuestions.companyId, q.companyId) : undefined,
            q.applicationId ? eq(interviewQuestions.applicationId, q.applicationId) : undefined,
            qs.hasTag(q.tagId),
            qs.matches(q.search, [
              interviewQuestions.question,
              interviewQuestions.answer,
              interviewQuestions.topic
            ])
          ],
          [
            asc(interviewQuestions.category),
            asc(interviewQuestions.topic),
            desc(interviewQuestions.updatedAt)
          ],
          page.limit,
          page.offset
        )
      },
      question: async (id) => qs.get(idArg.parse(id)),
      createQuestion: async (input) => {
        const [data, tagIds] = splitTags(questionInputSchema.parse(input))
        return qs.insert(
          {
            ...data,
            ease: 2.5,
            intervalDays: 0,
            repetitions: 0,
            lapses: 0,
            dueAt: now(),
            lastReviewedAt: null
          },
          tagIds
        )
      },
      updateQuestion: async (args) => {
        const { id, patch } = updateArgs(questionPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return qs.patch(id, data, tagIds)
      },
      removeQuestion: async (id) => qs.softDelete(idArg.parse(id)),
      topics: async () =>
        this.db
          .selectDistinct({ topic: interviewQuestions.topic })
          .from(interviewQuestions)
          .where(and(isNull(interviewQuestions.deletedAt), sql`${interviewQuestions.topic} != ''`))
          .all()
          .map((r) => r.topic)
          .sort((a, b) => a.localeCompare(b, 'uk')),
      practiceQueue: async (args) => {
        const q = z
          .object({
            limit: z.number().int().min(1).max(200).optional(),
            category: z.enum(['technical', 'behavioral', 'company', 'salary', 'other']).optional(),
            group: z.enum(['technical', 'nontechnical']).optional()
          })
          .parse(args ?? {})
        return qs.listWhere(
          [
            lte(interviewQuestions.dueAt, now()),
            q.category ? eq(interviewQuestions.category, q.category) : undefined,
            q.group === 'technical'
              ? eq(interviewQuestions.category, 'technical')
              : q.group === 'nontechnical'
                ? ne(interviewQuestions.category, 'technical')
                : undefined
          ],
          [asc(interviewQuestions.dueAt)],
          q.limit ?? 30
        )
      },
      reviewQuestion: async (args) => {
        const { id, grade, extra } = questionReviewSchema.parse(args)
        const row = qs.rowOrThrow(id)
        const next = schedule(row, grade as ReviewGrade, now())
        // Extra practice must not distort the schedule: it can only bring a question back sooner (a lapse),
        // a good answer ahead of time doesn't push the next review further.
        const values = extra && next.dueAt >= row.dueAt ? { lastReviewedAt: now() } : next
        this.db.update(interviewQuestions).set(values).where(eq(interviewQuestions.id, id)).run()
        return qs.getOrThrow(id)
      },
      practiceExtra: async (args) => {
        const q = z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            category: z.enum(['technical', 'behavioral', 'company', 'salary', 'other']).optional(),
            group: z.enum(['technical', 'nontechnical']).optional(),
            topic: z.string().max(100).optional(),
            excludeIds: z.array(idArg).max(1000).optional()
          })
          .parse(args ?? {})
        return qs.listWhere(
          [
            q.category ? eq(interviewQuestions.category, q.category) : undefined,
            q.group === 'technical'
              ? eq(interviewQuestions.category, 'technical')
              : q.group === 'nontechnical'
                ? ne(interviewQuestions.category, 'technical')
                : undefined,
            q.topic ? eq(interviewQuestions.topic, q.topic) : undefined,
            q.excludeIds?.length ? notInArray(interviewQuestions.id, q.excludeIds) : undefined
          ],
          [asc(interviewQuestions.dueAt), asc(interviewQuestions.ease)],
          q.limit ?? 10
        )
      },

      /* stats & overview */
      stats: async (args) =>
        this.stats(
          z.object({ from: z.number().optional(), to: z.number().optional() }).parse(args ?? {})
        ),
      overview: async () => ({
        today: this.daily(28),
        upcoming: this.upcomingStages(6),
        followUps: await this.api().followUps(),
        activeCount:
          this.db
            .select({ c: sql<number>`count(*)` })
            .from(applications)
            .where(
              and(
                isNull(applications.deletedAt),
                isNull(applications.closedAt),
                sql`${applications.status} != 'saved'`
              )
            )
            .get()?.c ?? 0,
        offers:
          this.db
            .select({ c: sql<number>`count(*)` })
            .from(applications)
            .where(and(isNull(applications.deletedAt), eq(applications.status, 'offer')))
            .get()?.c ?? 0,
        questionsDue: this.questionsDue()
      })
    }
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

  /** Interview events are identified for the calendar feed. */
  isInterviewEvent(e: typeof events.$inferSelect): boolean {
    return e.sourceType === STAGE_SOURCE
  }
}

export { APPLICATION_STATUSES, STATUS_LABEL }
