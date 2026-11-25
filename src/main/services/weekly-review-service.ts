import { and, eq, gte, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm'
import type { ReviewApi } from '@shared/api'
import { CARD_ON_LIVE_BOARD } from '../modules/boards'
import type { EntitySummary } from '@shared/domain/common'
import type { MoneyByCurrency } from '@shared/domain/finance'
import type { Currency } from '@shared/domain/crm'
import {
  reviewNotesSchema,
  type WeekMetric,
  type WeekSection,
  type WeekSnapshot,
  type WeeklyReview
} from '@shared/domain/review'
import { calendarItemRoute } from '@shared/domain/calendar'
import type { DbContext, Orm } from '../db/client'
import {
  applications,
  applicationStages,
  bookmarks,
  cards,
  checklistItems,
  checklists,
  ideas,
  interviewQuestions,
  notes,
  projects,
  proposals,
  timeEntries,
  weeklyReviews,
  wordReviews,
  withdrawals
} from '../db/schema'
import { addDays, dayKey, newId, now, startOfWeek, overlapMinutes } from '../core/util'
import type { FinanceModule } from '../modules/finance'
import type { CalendarModule } from '../modules/calendar'
import type { BoardsModule } from '../modules/boards'
import type { JobsModule } from '../modules/jobs'
import type { FreelanceModule } from '../modules/freelance'
import type { DevProjectsModule } from '../modules/dev-projects'
import type { GitClient } from './git-client'

const add = (m: MoneyByCurrency, c: Currency, v: number): void => {
  m[c] = Math.round(((m[c] ?? 0) + v) * 100) / 100
}

/** Builds the weekly snapshot (with week-over-week comparison) and stores your notes per week. */
export class WeeklyReviewService {
  constructor(
    private readonly ctx: DbContext,
    private readonly mods: {
      finance: FinanceModule
      calendar: CalendarModule
      boards: BoardsModule
      jobs: JobsModule
      freelance: FreelanceModule
      dev: DevProjectsModule
      git: GitClient
    }
  ) {}

  private get db(): Orm {
    return this.ctx.orm
  }

  private count(
    table: Parameters<ReturnType<DbContext['orm']['select']>['from']>[0],
    where: ReturnType<typeof and>
  ): number {
    return (
      (
        this.db
          .select({ c: sql<number>`count(*)` })
          .from(table)
          .where(where)
          .get() as { c: number } | undefined
      )?.c ?? 0
    )
  }

  /** Raw numbers for a week (used for the current and the previous week). */
  private async numbers(from: number, to: number): Promise<Record<string, number>> {
    const inRange = (col: Parameters<typeof gte>[0]): SQL | undefined =>
      and(gte(col, from), lte(col, to))
    // Finished entries, only the part inside the week (a session over Sunday midnight is split).
    // Time of projects in the trash is not counted.
    const minutes = this.db
      .select({
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        minutes: timeEntries.minutes
      })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(
        and(
          isNull(projects.deletedAt),
          isNotNull(timeEntries.endedAt),
          lte(timeEntries.startedAt, to),
          gte(timeEntries.endedAt, from)
        )
      )
      .all()
      .reduce((s, t) => s + overlapMinutes(t, from, to, now()), 0)
    const sentProposals = this.db
      .select()
      .from(proposals)
      .where(and(isNull(proposals.deletedAt), inRange(proposals.sentAt)))
      .all()
    const sentApps = this.db
      .select()
      .from(applications)
      .where(and(isNull(applications.deletedAt), inRange(applications.appliedAt)))
      .all()
    const commits = await this.mods.git.commitsBetween(this.mods.dev.paths(), from, to)
    return {
      cardsDone: this.count(
        cards,
        and(isNull(cards.deletedAt), CARD_ON_LIVE_BOARD, inRange(cards.completedAt))
      ),
      // Items of checklists in the trash don't count (same as the dashboard).
      checksDone: this.count(
        checklistItems,
        and(
          inRange(checklistItems.doneAt),
          sql`${checklistItems.checklistId} IN (SELECT ${checklists.id} FROM ${checklists} WHERE ${checklists.deletedAt} IS NULL)`
        )
      ),
      ideas: this.count(ideas, and(isNull(ideas.deletedAt), inRange(ideas.createdAt))),
      notes: this.count(notes, and(isNull(notes.deletedAt), inRange(notes.createdAt))),
      minutes,
      proposals: sentProposals.length,
      proposalReplies: this.count(
        proposals,
        and(isNull(proposals.deletedAt), inRange(proposals.repliedAt))
      ),
      contracts: this.count(
        proposals,
        and(isNull(proposals.deletedAt), inRange(proposals.hiredAt))
      ),
      credits: sentProposals.reduce((s, p) => s + p.credits + p.boostCredits, 0),
      applications: sentApps.length,
      appReplies: this.count(
        applications,
        and(isNull(applications.deletedAt), inRange(applications.repliedAt))
      ),
      // Stages of vacancies in the trash don't count.
      interviews: this.count(
        applicationStages,
        and(
          inRange(applicationStages.at),
          sql`${applicationStages.kind} != 'test_task'`,
          sql`${applicationStages.applicationId} IN (SELECT ${applications.id} FROM ${applications} WHERE ${applications.deletedAt} IS NULL)`
        )
      ),
      offers: this.count(
        applications,
        and(
          isNull(applications.deletedAt),
          eq(applications.status, 'offer'),
          inRange(applications.updatedAt)
        )
      ),
      words: this.count(wordReviews, inRange(wordReviews.reviewedAt)),
      questions: this.count(
        interviewQuestions,
        and(isNull(interviewQuestions.deletedAt), inRange(interviewQuestions.lastReviewedAt))
      ),
      bookmarksDone: this.count(
        bookmarks,
        and(isNull(bookmarks.deletedAt), inRange(bookmarks.finishedAt))
      ),
      commits
    }
  }

  private money(from: number, to: number): WeekSnapshot['money'] {
    const net: MoneyByCurrency = {}
    for (const i of this.mods.finance.income(from, to)) add(net, i.currency, i.net)
    const exp: MoneyByCurrency = {}
    // Finance's own list: a subscription the client pays is never counted as my expense.
    for (const e of this.mods.finance.expensesIn(from, to)) add(exp, e.currency, e.amount)
    for (const c of this.mods.freelance.creditPurchases(from, to)) add(exp, c.currency, c.cost)
    for (const w of this.db
      .select()
      .from(withdrawals)
      .where(and(gte(withdrawals.at, from), lte(withdrawals.at, to)))
      .all())
      add(exp, w.currency as Currency, w.fee)
    const profit: MoneyByCurrency = { ...net }
    for (const [c, v] of Object.entries(exp)) add(profit, c as Currency, -(v ?? 0))
    return { net, expenses: exp, profit }
  }

  async snapshot(weekStart: number): Promise<WeekSnapshot> {
    const from = startOfWeek(weekStart)
    const to = addDays(from, 7) - 1
    const [cur, prev] = await Promise.all([
      this.numbers(from, to),
      this.numbers(addDays(from, -7), from - 1)
    ])
    const metric = (
      key: string,
      label: string,
      unit: WeekMetric['unit'] = 'count',
      better: WeekMetric['better'] = 'up'
    ): WeekMetric => ({
      key,
      label,
      value: cur[key],
      previous: prev[key],
      unit,
      better
    })
    const sections: WeekSection[] = [
      {
        id: 'work',
        title: 'Робота',
        metrics: [
          metric('cardsDone', 'Завдань закрито'),
          metric('checksDone', 'Пунктів чек-листів'),
          metric('minutes', 'Відпрацьовано', 'minutes'),
          metric('ideas', 'Нових ідей'),
          metric('notes', 'Нотаток')
        ]
      },
      {
        id: 'freelance',
        title: 'Фриланс',
        metrics: [
          metric('proposals', 'Відгуків'),
          metric('proposalReplies', 'Відповідей'),
          metric('contracts', 'Контрактів'),
          metric('credits', 'Конектів витрачено', 'count', 'down')
        ]
      },
      {
        id: 'jobs',
        title: 'Пошук роботи',
        metrics: [
          metric('applications', 'Відгуків на вакансії'),
          metric('appReplies', 'Відповідей'),
          metric('interviews', 'Співбесід'),
          metric('offers', 'Оферів')
        ]
      },
      {
        id: 'learning',
        title: 'Навчання',
        metrics: [
          metric('words', 'Повторень слів'),
          metric('questions', 'Питань відпрацьовано'),
          metric('bookmarksDone', 'Матеріалів опрацьовано')
        ]
      },
      { id: 'code', title: 'Код', metrics: [metric('commits', 'Комітів у моїх проєктах')] }
    ]

    const summaries = <T extends EntitySummary>(refs: T[]): T[] => refs.slice(0, 12)
    const doneCards = this.db
      .select({ id: cards.id, title: cards.title })
      .from(cards)
      .where(
        and(
          isNull(cards.deletedAt),
          CARD_ON_LIVE_BOARD,
          gte(cards.completedAt, from),
          lte(cards.completedAt, to)
        )
      )
      .all()
      .map((c): EntitySummary => ({ type: 'card', id: c.id, title: c.title }))
    const staleProposals = (await this.mods.freelance.proposalsApi().stale({ days: 3 })).map(
      (p): EntitySummary => ({
        type: 'proposal',
        id: p.id,
        title: p.jobTitle,
        subtitle: p.clientName || undefined
      })
    )
    const followUps = (await this.mods.jobs.api().followUps()).map((a): EntitySummary => ({
      type: 'application',
      id: a.id,
      title: a.title,
      subtitle: a.company || undefined
    }))
    const overdue = this.mods.boards
      .due({ from: 0, to: Date.now() - 1 })
      .filter((c) => !c.columnIsDone)
      .map((c): EntitySummary => ({
        type: 'card',
        id: c.id,
        title: c.title,
        subtitle: c.boardTitle
      }))
    // Subscriptions due within the reviewed week (it may span two months), not the current month.
    const dueUntil = Math.min(to, Date.now())
    const months = [...new Set([dayKey(from).slice(0, 7), dayKey(to).slice(0, 7)])]
    const unpaid = months
      .flatMap((m) => this.mods.finance.subscriptionMonth(m))
      .filter((s) => !s.expenseId && s.dueAt >= from && s.dueAt <= dueUntil)
      // A subscription is no entity of its own: the row opens the month on «Витрати», where it is marked paid.
      .map((s) => ({
        type: 'event' as const,
        id: s.id,
        title: `${s.title} · ${s.amount} ${s.currency}`,
        subtitle: 'Підписку не позначено',
        route: `/finance/expenses?month=${dayKey(s.dueAt).slice(0, 7)}`
      }))
    const upcoming = this.mods.calendar
      .feed(to + 1, addDays(from, 14) - 1)
      .slice(0, 12)
      .map((i) => ({
        title: i.title,
        at: i.startAt,
        route: calendarItemRoute(i),
        allDay: i.allDay
      }))
    return {
      weekStart: dayKey(from),
      from,
      to,
      sections,
      money: this.money(from, to),
      pending: [
        { title: 'Відгуки без відповіді', items: summaries(staleProposals) },
        { title: 'Вакансії: нагадати про себе', items: summaries(followUps) },
        { title: 'Прострочені завдання', items: summaries(overdue) },
        { title: 'Неоплачені підписки', items: summaries(unpaid) }
      ].filter((g) => g.items.length),
      done: summaries(doneCards),
      upcoming
    }
  }

  private toReview(r: typeof weeklyReviews.$inferSelect, snapshot: WeekSnapshot): WeeklyReview {
    return {
      id: r.id,
      weekStart: r.weekStart,
      snapshot,
      summary: r.summary,
      plan: r.plan,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  }

  /** Current week is always fresh; finished weeks are frozen the first time they are opened. */
  async get(weekStartKey?: string): Promise<WeeklyReview> {
    const start = weekStartKey ? new Date(`${weekStartKey}T00:00:00`).getTime() : startOfWeek(now())
    const key = dayKey(startOfWeek(start))
    const existing = this.db
      .select()
      .from(weeklyReviews)
      .where(eq(weeklyReviews.weekStart, key))
      .get()
    const finished = addDays(startOfWeek(start), 7) <= now()
    if (existing?.snapshot && finished)
      return this.toReview(existing, existing.snapshot as WeekSnapshot)
    const snapshot = await this.snapshot(start)
    const ts = now()
    if (existing) {
      if (finished)
        this.db
          .update(weeklyReviews)
          .set({ snapshot, updatedAt: ts })
          .where(eq(weeklyReviews.id, existing.id))
          .run()
      return this.toReview(existing, snapshot)
    }
    const row = this.db
      .insert(weeklyReviews)
      .values({
        id: newId(),
        weekStart: key,
        snapshot: finished ? snapshot : null,
        summary: '',
        plan: '',
        createdAt: ts,
        updatedAt: ts
      })
      .returning()
      .get()
    return this.toReview(row, snapshot)
  }

  saveNotes(weekStart: string, patch: { summary?: string; plan?: string }): void {
    const existing = this.db
      .select()
      .from(weeklyReviews)
      .where(eq(weeklyReviews.weekStart, weekStart))
      .get()
    const ts = now()
    if (existing)
      this.db
        .update(weeklyReviews)
        .set({ ...patch, updatedAt: ts })
        .where(eq(weeklyReviews.id, existing.id))
        .run()
    else
      this.db
        .insert(weeklyReviews)
        .values({
          id: newId(),
          weekStart,
          snapshot: null,
          summary: patch.summary ?? '',
          plan: patch.plan ?? '',
          createdAt: ts,
          updatedAt: ts
        })
        .run()
  }

  list(): { weekStart: string; hasNotes: boolean }[] {
    return this.db
      .select({
        weekStart: weeklyReviews.weekStart,
        summary: weeklyReviews.summary,
        plan: weeklyReviews.plan
      })
      .from(weeklyReviews)
      .orderBy(sql`${weeklyReviews.weekStart} DESC`)
      .all()
      .map((r) => ({ weekStart: r.weekStart, hasNotes: !!(r.summary || r.plan) }))
  }

  api(): ReviewApi {
    return {
      get: async (args) => this.get(args?.weekStart),
      saveNotes: async (input) => {
        const { weekStart, summary, plan } = reviewNotesSchema.parse(input)
        this.saveNotes(weekStart, { summary, plan })
      },
      list: async () => this.list()
    }
  }
}
