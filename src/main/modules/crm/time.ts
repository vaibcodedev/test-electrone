import { and, desc, eq, gte, isNull, lte, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { TimeApi } from '@shared/api'
import {
  timeEntryInputSchema,
  timeEntryPatchSchema,
  type RunningTimer,
  type TimeEntry
} from '@shared/domain/crm'
import { projects, timeEntries } from '../../db/schema'
import type { Orm } from '../../db/client'
import { newId, now, NotFoundError, overlapMinutes, UserError } from '../../core/util'
import { idArg, updateArgs, type ModuleContext } from '../context'
import { minutesBetween, toTime, type ProjectRepo, type TimeRow } from './shared'

/** Time tracking: one running timer at a time (window and tray), manual entries, minutes per period. */
export class TimeTracker {
  constructor(
    private readonly m: ModuleContext,
    private readonly projectRepo: ProjectRepo
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  /** Active projects, most recently touched first — the tray's «start timer» list. */
  recentActiveProjects(limit = 6): { id: string; title: string }[] {
    return this.db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.status, 'active')))
      .orderBy(desc(projects.updatedAt))
      .limit(limit)
      .all()
  }

  running(): RunningTimer | null {
    const row = this.db
      .select({ entry: timeEntries, projectTitle: projects.title })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(and(isNull(timeEntries.endedAt), isNull(projects.deletedAt)))
      .orderBy(desc(timeEntries.startedAt))
      .get()
    return row ? { ...toTime(row.entry), projectTitle: row.projectTitle } : null
  }

  stopRunning(): TimeEntry | null {
    return this.stopWhere()
  }

  /** A project going to the trash stops its timer — or the next start elsewhere would bill it for days. */
  stopRunningOf(projectId: string): void {
    this.stopWhere(eq(timeEntries.projectId, projectId))
  }

  private stopWhere(scope?: SQL): TimeEntry | null {
    const run = this.db
      .select()
      .from(timeEntries)
      .where(and(isNull(timeEntries.endedAt), scope))
      .all()
    let last: TimeEntry | null = null
    const ts = now()
    for (const r of run) {
      // Under a minute = an accidental start/stop: don't keep a «0 хв» entry.
      if (ts - r.startedAt < 60_000) {
        this.db.delete(timeEntries).where(eq(timeEntries.id, r.id)).run()
        continue
      }
      const updated = this.db
        .update(timeEntries)
        .set({ endedAt: ts, minutes: minutesBetween(r.startedAt, ts) })
        .where(eq(timeEntries.id, r.id))
        .returning()
        .get()
      last = toTime(updated!)
    }
    return last
  }

  /** Minutes worked inside [from, to]: entries crossing midnight / week boundaries count only their part. */
  minutesInRange(from: number, to: number): number {
    const at = now()
    // Projects in the trash don't count (running() already hides them).
    return this.db
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
          lte(timeEntries.startedAt, to),
          or(isNull(timeEntries.endedAt), gte(timeEntries.endedAt, from))
        )
      )
      .all()
      .reduce((s, t) => s + overlapMinutes(t, from, to, at), 0)
  }

  api(): TimeApi {
    const find = (id: string): TimeRow => {
      const row = this.db.select().from(timeEntries).where(eq(timeEntries.id, id)).get()
      if (!row) throw new NotFoundError('Запис часу', id)
      return row
    }
    return {
      list: async (args) => {
        const q = z
          .object({
            projectId: idArg.optional(),
            from: z.number().optional(),
            to: z.number().optional()
          })
          .parse(args ?? {})
        return this.db
          .select()
          .from(timeEntries)
          .where(
            and(
              q.projectId ? eq(timeEntries.projectId, q.projectId) : undefined,
              q.from !== undefined ? gte(timeEntries.startedAt, q.from) : undefined,
              q.to !== undefined ? lte(timeEntries.startedAt, q.to) : undefined
            )
          )
          .orderBy(desc(timeEntries.startedAt))
          .all()
          .map(toTime)
      },
      running: async () => this.running(),
      start: async (args) => {
        const { projectId, description } = z
          .object({ projectId: idArg, description: z.string().max(2000).optional() })
          .parse(args)
        this.projectRepo.rowOrThrow(projectId)
        this.m.db.tx(() => {
          this.stopRunning()
          this.db
            .insert(timeEntries)
            .values({
              id: newId(),
              projectId,
              description: description ?? '',
              startedAt: now(),
              endedAt: null,
              minutes: 0,
              billable: true,
              createdAt: now()
            })
            .run()
        })
        this.m.bus.dataChanged(['project'])
        return this.running()!
      },
      stop: async () => {
        const entry = this.stopRunning()
        this.m.bus.dataChanged(['project'])
        return entry
      },
      create: async (input) => {
        const data = timeEntryInputSchema.parse(input)
        this.projectRepo.rowOrThrow(data.projectId)
        const endedAt = data.endedAt ?? data.startedAt
        if (endedAt < data.startedAt) {
          throw new UserError('Кінець раніше за початок — виправте дату')
        }
        const row = this.db
          .insert(timeEntries)
          .values({
            ...data,
            id: newId(),
            endedAt,
            minutes: minutesBetween(data.startedAt, endedAt),
            createdAt: now()
          })
          .returning()
          .get()
        return toTime(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(timeEntryPatchSchema).parse(args)
        const cur = find(id)
        // One running timer at a time: reopening a finished entry would start a second one (hours counted twice).
        if (patch.endedAt === null && cur.endedAt !== null)
          throw new UserError('Завершений запис не можна знову запустити — почніть новий таймер')
        if (patch.projectId) this.projectRepo.rowOrThrow(patch.projectId)
        const startedAt = patch.startedAt ?? cur.startedAt
        const endedAt = patch.endedAt !== undefined ? patch.endedAt : cur.endedAt
        if (endedAt !== null && endedAt < startedAt) {
          throw new UserError('Кінець раніше за початок — виправте дату')
        }
        const row = this.db
          .update(timeEntries)
          .set({ ...patch, minutes: endedAt ? minutesBetween(startedAt, endedAt) : 0 })
          .where(eq(timeEntries.id, id))
          .returning()
          .get()
        return toTime(row!)
      },
      remove: async (id) => {
        this.db
          .delete(timeEntries)
          .where(eq(timeEntries.id, idArg.parse(id)))
          .run()
      }
    }
  }
}
