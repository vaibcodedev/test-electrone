import { and, asc, eq, gte, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { JobsApi } from '@shared/api'
import {
  checkinSchema,
  jobBoardInputSchema,
  jobBoardPatchSchema,
  type BoardDay,
  type DailyBoard,
  type JobBoard
} from '@shared/domain/jobs'
import { applications, boardCheckins, jobBoards, resumeBoards } from '../../db/schema'
import type { Orm } from '../../db/client'
import { nextPosition, reorder } from '../../core/ordering'
import { addDays, dayKey, newId, now, NotFoundError, startOfDay, UserError } from '../../core/util'
import { idArg, orderedIds, updateArgs, type ModuleContext } from '../context'

// Colours from the shared palette (shared/colors.ts), so the colour picker shows the seeded swatch as chosen.
const SEED = [
  { name: 'Djinni', url: 'https://djinni.co/jobs/', color: '#3fbf9b', dailyTarget: 2 },
  { name: 'DOU', url: 'https://jobs.dou.ua/', color: '#5aa9f0', dailyTarget: 1 },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs/', color: '#7c8cf8', dailyTarget: 1 },
  { name: 'Work.ua', url: 'https://www.work.ua/jobs-it/', color: '#f06b6b', dailyTarget: 0 }
]

/** Job boards (Djinni, DOU…) with the daily habit: applications per day, manual check-ins, streaks. */
export class JobBoards {
  constructor(private readonly m: ModuleContext) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  hasAny(): boolean {
    return !!this.db.select({ id: jobBoards.id }).from(jobBoards).limit(1).get()
  }

  seed(): void {
    const ts = now()
    SEED.forEach((b, i) =>
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

  list(includeInactive = false): JobBoard[] {
    return this.db
      .select()
      .from(jobBoards)
      .where(includeInactive ? undefined : eq(jobBoards.active, true))
      .orderBy(asc(jobBoards.position))
      .all()
  }

  /** Board × day matrix for the last `days` days (today included). */
  daily(days = 28): DailyBoard[] {
    const today = startOfDay(now())
    const from = addDays(today, -(days - 1))
    const list = this.list()
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
      for (let ts = from; ts <= today; ts = addDays(ts, 1)) {
        const day = dayKey(ts)
        const n = applied.filter((a) => a.boardId === b.id && a.at && dayKey(a.at) === day).length
        const checked = checks.some((c) => c.boardId === b.id && c.day === day)
        // Days before the board existed are not missed days (a new base would start with weeks of gaps).
        const expected = ts >= startOfDay(b.createdAt) && b.weekdays.includes(new Date(ts).getDay())
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

  /** Only a board nothing refers to yet (a typo, a test): one with history is switched off instead. */
  remove(id: string): void {
    this.m.db.tx(() => {
      if (!this.db.select({ id: jobBoards.id }).from(jobBoards).where(eq(jobBoards.id, id)).get())
        throw new NotFoundError('Сайт', id)
      // Vacancies in the trash count too: restored, they would point at a board that no longer exists.
      if (
        this.db
          .select({ id: applications.id })
          .from(applications)
          .where(eq(applications.boardId, id))
          .limit(1)
          .get()
      )
        throw new UserError(
          'На сайті вже є вакансії (можливо, у кошику) — вимкніть його замість видалення'
        )
      if (
        this.db
          .select({ day: boardCheckins.day })
          .from(boardCheckins)
          .where(eq(boardCheckins.boardId, id))
          .limit(1)
          .get()
      )
        throw new UserError('Сайт уже має позначки днів — вимкніть його замість видалення')
      this.db.delete(resumeBoards).where(eq(resumeBoards.boardId, id)).run()
      this.db.delete(jobBoards).where(eq(jobBoards.id, id)).run()
    })
  }

  api(): Pick<
    JobsApi,
    'boards' | 'createBoard' | 'updateBoard' | 'removeBoard' | 'reorderBoards' | 'daily' | 'checkin'
  > {
    return {
      boards: async (args) =>
        this.list(
          z.object({ includeInactive: z.boolean().optional() }).parse(args ?? {}).includeInactive
        ),
      createBoard: async (input) => {
        const data = jobBoardInputSchema.parse(input)
        const ts = now()
        return this.db
          .insert(jobBoards)
          .values({
            ...data,
            id: newId(),
            position: nextPosition(this.m.db, jobBoards.position),
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
      },
      updateBoard: async (args) => {
        const { id, patch } = updateArgs(jobBoardPatchSchema).parse(args)
        const row = this.db
          .update(jobBoards)
          .set({ ...patch, updatedAt: now() })
          .where(eq(jobBoards.id, id))
          .returning()
          .get()
        if (!row) throw new NotFoundError('Сайт', id)
        return row
      },
      removeBoard: async (id) => this.remove(idArg.parse(id)),
      reorderBoards: async (ids) =>
        reorder(this.m.db, jobBoards, jobBoards.id, orderedIds.parse(ids)),
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
      }
    }
  }
}
