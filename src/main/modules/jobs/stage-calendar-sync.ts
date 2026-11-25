import { and, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import { FEED_COLOR } from '@shared/domain/calendar'
import { fieldMax, MAX } from '@shared/domain/limits'
import { stageInputSchema, type StageKind } from '@shared/domain/jobs'
import { applications, applicationStages, events, pins } from '../../db/schema'
import type { Orm } from '../../db/client'
import { now } from '../../core/util'
import type { ModuleContext } from '../context'
import type { CalendarModule } from '../calendar'
import {
  applicationTitle,
  STAGE_DEADLINE_SOURCE,
  STAGE_LABEL,
  STAGE_SOURCE,
  type StageRow
} from './shared'

const STAGE_DURATION_MAX = fieldMax(stageInputSchema.shape.durationMin)

/** Ids of the stages whose vacancy is in the trash. */
const STAGES_OF_TRASHED_VACANCIES = sql`SELECT ${applicationStages.id} FROM ${applicationStages} INNER JOIN ${applications} ON ${applications.id} = ${applicationStages.applicationId} WHERE ${applications.deletedAt} IS NOT NULL`

/**
 * Stage events of a vacancy in the trash keep deletedAt = null (they'd otherwise show up in the trash one by
 * one, restorable apart from the vacancy) and are hidden through this condition, like cards of a deleted board.
 * coalesce: a NULL sourceType would make NOT (NULL IN …) NULL and hide every ordinary event.
 */
const STAGE_EVENTS_ALIVE: SQL = sql`NOT (coalesce(${events.sourceType}, '') IN (${STAGE_SOURCE}, ${STAGE_DEADLINE_SOURCE}) AND coalesce(${events.sourceId}, '') IN (${STAGES_OF_TRASHED_VACANCIES}))`

/**
 * Interview stages ↔ calendar events, both ways: a stage with a time gets an event (and a test task its
 * deadline event); moving the event in the calendar moves the stage. The events live and die with the vacancy;
 * the stage is the source of truth, so the calendar can't delete them on its own.
 */
export class StageCalendarSync {
  constructor(
    private readonly m: ModuleContext,
    private readonly calendar: CalendarModule
  ) {
    // Moving/renaming an interview in the calendar updates the stage.
    calendar.onEventChanged((e) => this.syncFromEvent(e))
    calendar.hideWhen(STAGE_EVENTS_ALIVE, 'Спершу відновіть вакансію, до якої належить ця подія')
    // Only the event the stage points at is owned: a stale copy older versions left behind (the stage was
    // cancelled, its event put into the trash) is an ordinary event and can be deleted.
    const owns = (stageId: string, eventId: string): boolean => {
      const s = this.db
        .select({
          eventId: applicationStages.eventId,
          deadlineEventId: applicationStages.deadlineEventId
        })
        .from(applicationStages)
        .where(eq(applicationStages.id, stageId))
        .get()
      return !!s && (s.eventId === eventId || s.deadlineEventId === eventId)
    }
    const hint = 'Це подія етапу вакансії — скасуйте або видаліть етап у самій вакансії'
    calendar.ownSource(STAGE_SOURCE, hint, owns)
    calendar.ownSource(STAGE_DEADLINE_SOURCE, hint, owns)
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  stagesOf(applicationId: string): StageRow[] {
    return this.db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.applicationId, applicationId))
      .all()
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
      // Not wanted any more (cancelled, time removed): gone for good, not into the trash, where a restore
      // would bring back a second event the next time the stage is planned.
      if (!want) {
        if (eventId) this.dropEvents([eventId])
        return null
      }
      // An event that ended up in the trash (older versions, a vacancy restored from it) comes back: the
      // stage still wants it, and a fresh insert would leave a duplicate waiting in the trash.
      const existing = eventId ? this.calendar.repo.row(eventId, true) : undefined
      if (existing?.deletedAt)
        this.db.update(events).set({ deletedAt: null }).where(eq(events.id, existing.id)).run()
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
      color: FEED_COLOR.interview,
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
        color: FEED_COLOR.interview,
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
    if (!e.sourceId || (e.sourceType !== STAGE_SOURCE && e.sourceType !== STAGE_DEADLINE_SOURCE))
      return
    const stage = this.db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, e.sourceId))
      .get()
    // A stale event the stage no longer points at must not move the stage.
    if (!stage || (stage.eventId !== e.id && stage.deadlineEventId !== e.id)) return
    const patch =
      e.sourceType === STAGE_SOURCE
        ? {
            at: e.startAt,
            // The calendar allows multi-day events; a stage lasts at most a day (stageInputSchema).
            durationMin: e.endAt
              ? Math.min(
                  STAGE_DURATION_MAX,
                  Math.max(15, Math.round((e.endAt - e.startAt) / 60_000))
                )
              : stage.durationMin
          }
        : { deadlineAt: e.startAt }
    this.db
      .update(applicationStages)
      .set({ ...patch, updatedAt: now() })
      .where(eq(applicationStages.id, stage.id))
      .run()
  }

  /** Deletes stage events for good with their tags, links, pins, files and index entries. */
  private dropEvents(ids: string[]): void {
    if (!ids.length) return
    const { repo, links, attachments } = this.m
    this.m.files.afterCommit(() =>
      this.m.db.tx(() => {
        for (const id of ids) {
          const ref = { type: 'event' as const, id }
          repo.tags.clearFor('event', id)
          links.clearFor(ref)
          attachments.clearFor(ref)
          repo.search.remove('event', id)
        }
        this.db
          .delete(pins)
          .where(and(eq(pins.entityType, 'event'), inArray(pins.entityId, ids)))
          .run()
        this.db.delete(events).where(inArray(events.id, ids)).run()
      })
    )
  }

  /** A stage removed: its events go with it (in the trash they would point at a stage that no longer exists). */
  purgeStage(stage: StageRow): void {
    this.dropEvents([stage.eventId, stage.deadlineEventId].filter((id): id is string => !!id))
  }

  /**
   * Older versions put the stage events of a deleted vacancy into the trash one by one. They now stay
   * deletedAt = null, hidden by STAGE_EVENTS_ALIVE until the vacancy is restored: take them out of the trash.
   */
  untrashHiddenEvents(): void {
    this.db
      .update(events)
      .set({ deletedAt: null })
      .where(
        and(
          isNotNull(events.deletedAt),
          inArray(events.sourceType, [STAGE_SOURCE, STAGE_DEADLINE_SOURCE]),
          sql`${events.sourceId} IN (${STAGES_OF_TRASHED_VACANCIES})`
        )
      )
      .run()
  }

  /**
   * Older versions trashed the event of a cancelled stage and cleared stage.eventId, so the trash keeps stage
   * events no stage points at any more. Restored, they could not be deleted from the calendar: drop them.
   */
  dropOrphanEvents(): void {
    const referenced = sql`SELECT ${applicationStages.eventId} FROM ${applicationStages} WHERE ${applicationStages.eventId} IS NOT NULL UNION SELECT ${applicationStages.deadlineEventId} FROM ${applicationStages} WHERE ${applicationStages.deadlineEventId} IS NOT NULL`
    const orphans = this.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          isNotNull(events.deletedAt),
          inArray(events.sourceType, [STAGE_SOURCE, STAGE_DEADLINE_SOURCE]),
          sql`${events.id} NOT IN (${referenced})`
        )
      )
      .all()
    this.dropEvents(orphans.map((r) => r.id))
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
    this.dropEvents(this.eventIds(applicationId))
  }
}
