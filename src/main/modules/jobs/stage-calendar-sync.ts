import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { fieldMax, MAX } from '@shared/domain/limits'
import { stageInputSchema, type StageKind } from '@shared/domain/jobs'
import { applicationStages, events } from '../../db/schema'
import type { Orm } from '../../db/client'
import { now } from '../../core/util'
import type { ModuleContext } from '../context'
import type { CalendarModule } from '../calendar'
import { applicationTitle, STAGE_DEADLINE_SOURCE, STAGE_LABEL, STAGE_SOURCE, type StageRow } from './shared'

const STAGE_DURATION_MAX = fieldMax(stageInputSchema.shape.durationMin)
const INTERVIEW_COLOR = '#7c8cf8'
const DEADLINE_COLOR = '#f5a524'

/**
 * Interview stages ↔ calendar events, both ways: a stage with a time gets an event (and a test task its
 * deadline event); moving the event in the calendar moves the stage. The events live and die with the vacancy.
 */
export class StageCalendarSync {
  constructor(
    private readonly m: ModuleContext,
    private readonly calendar: CalendarModule
  ) {
    // Moving/renaming an interview in the calendar updates the stage.
    calendar.onEventChanged((e) => this.syncFromEvent(e))
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  stagesOf(applicationId: string): StageRow[] {
    return this.db.select().from(applicationStages).where(eq(applicationStages.applicationId, applicationId)).all()
  }

  /** Calendar events mirroring the vacancy's stages, alive or in the trash. */
  eventIds(applicationId: string): string[] {
    return this.stagesOf(applicationId)
      .flatMap((s) => [s.eventId, s.deadlineEventId])
      .filter((id): id is string => !!id)
  }

  /** Creates/updates/removes the calendar events that mirror a stage. */
  sync(stage: StageRow): void {
    const { title, company } = applicationTitle(this.db, stage.applicationId)
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
        // «Етап: компанія» can outgrow an event title (both parts are long): clip, the full text is in the stage.
        title: values.title.slice(0, MAX.title),
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
        remind2Minutes: 24 * 60,
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

  /** Every stage of the vacancy (titles follow a renamed vacancy/company). */
  syncAll(applicationId: string): void {
    for (const s of this.stagesOf(applicationId)) this.sync(s)
  }

  /** Calendar → stage: the user moved the event in the calendar. */
  private syncFromEvent(e: {
    id: string
    sourceType: string | null
    sourceId: string | null
    startAt: number
    endAt: number | null
  }): void {
    if (!e.sourceId || (e.sourceType !== STAGE_SOURCE && e.sourceType !== STAGE_DEADLINE_SOURCE)) return
    const stage = this.db.select().from(applicationStages).where(eq(applicationStages.id, e.sourceId)).get()
    if (!stage) return
    const patch =
      e.sourceType === STAGE_SOURCE
        ? {
            at: e.startAt,
            // The calendar allows multi-day events; a stage lasts at most a day (stageInputSchema).
            durationMin: e.endAt
              ? Math.min(STAGE_DURATION_MAX, Math.max(15, Math.round((e.endAt - e.startAt) / 60_000)))
              : stage.durationMin
          }
        : { deadlineAt: e.startAt }
    this.db
      .update(applicationStages)
      .set({ ...patch, updatedAt: now() })
      .where(eq(applicationStages.id, stage.id))
      .run()
  }

  /** A stage removed: its events go to the trash. */
  removeStageEvents(stage: StageRow): void {
    for (const id of [stage.eventId, stage.deadlineEventId]) {
      if (id && this.calendar.repo.row(id)) this.calendar.repo.softDelete(id)
    }
  }

  /** The vacancy went to the trash: so do its interviews and deadlines. */
  remove(applicationId: string): void {
    for (const s of this.stagesOf(applicationId)) this.removeStageEvents(s)
  }

  /** The vacancy is back from the trash: so are its interviews and deadlines (re-synced: title, time). */
  restore(applicationId: string): void {
    const ids = this.eventIds(applicationId)
    if (ids.length) {
      this.db
        .update(events)
        .set({ deletedAt: null, updatedAt: now() })
        .where(and(inArray(events.id, ids), isNotNull(events.deletedAt)))
        .run()
    }
    this.syncAll(applicationId)
  }

  /** The vacancy is deleted for good: its stage events too (not into the trash, where they'd be orphans). */
  purge(applicationId: string): void {
    const ids = this.eventIds(applicationId)
    if (ids.length) this.db.delete(events).where(inArray(events.id, ids)).run()
  }
}
