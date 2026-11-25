/**
 * Calendar events with recurrence + one aggregated feed: other modules add their dated items
 * (card deadlines, payments, subscriptions, follow-ups…) as feed providers, wired in container.ts.
 */
import { and, asc, gte, lte, ne, or, eq, type SQL } from 'drizzle-orm'
import type { EventsApi } from '@shared/api'
import {
  eventInputSchema,
  eventPatchSchema,
  rangeSchema,
  type CalendarEvent,
  type CalendarItem,
  type Recurrence
} from '@shared/domain/calendar'
import { pageSchema } from '@shared/domain/common'
import { fieldMax } from '@shared/domain/limits'
import { fmtDateTime, fmtDayFull } from '@shared/dates'
import { events } from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { UserError } from '../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'

type EventRow = typeof events.$inferSelect

function addInterval(ts: number, rec: Recurrence, n: number): number {
  const d = new Date(ts)
  switch (rec) {
    case 'daily':
      d.setDate(d.getDate() + n)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7 * n)
      break
    // Clamp to the month's last day: «31 січня щомісяця» → 28/29 лютого, not 3 березня; 29 лютого yearly → 28.
    case 'monthly':
    case 'yearly': {
      const day = d.getDate()
      d.setDate(1)
      if (rec === 'monthly') d.setMonth(d.getMonth() + n)
      else d.setFullYear(d.getFullYear() + n)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(day, last))
      break
    }
    default:
      return ts
  }
  return d.getTime()
}

/** Start times of every occurrence of an event overlapping [from, to]. Pure, exported for tests. */
export function occurrences(
  e: Pick<EventRow, 'startAt' | 'endAt' | 'recurrence'>,
  from: number,
  to: number
): number[] {
  const duration = e.endAt ? e.endAt - e.startAt : 0
  const rec = e.recurrence as Recurrence
  if (rec === 'none') return e.startAt <= to && e.startAt + duration >= from ? [e.startAt] : []
  const out: number[] = []
  // Jump close to `from` for daily/weekly to avoid iterating years of history.
  let n = 0
  if (rec === 'daily' || rec === 'weekly') {
    const step = (rec === 'daily' ? 1 : 7) * 86_400_000
    n = Math.max(0, Math.floor((from - duration - e.startAt) / step) - 1)
  }
  for (let i = 0; i < 1000; i++, n++) {
    const start = addInterval(e.startAt, rec, n)
    if (start > to) break
    if (start + duration >= from) out.push(start)
  }
  return out
}

type EventListener = (e: EventRow) => void
/** Calendar items contributed by other modules (card deadlines, payments, subscriptions, follow-ups…). */
export type FeedProvider = (from: number, to: number) => CalendarItem[]
/** Decorates events owned by another module (interview stages → open the vacancy). */
export type SourceDecorator = (e: CalendarEvent) => Partial<CalendarItem> | null

export class CalendarModule {
  readonly descriptor: EntityDescriptor
  readonly repo: SoftRepository<EventRow, CalendarEvent>
  private readonly listeners: EventListener[] = []
  private readonly providers: FeedProvider[] = []
  private readonly decorators = new Map<string, SourceDecorator>()
  private readonly owners = new Map<
    string,
    { hint: string; owns: (sourceId: string, eventId: string) => boolean }
  >()

  onEventChanged(listener: EventListener): void {
    this.listeners.push(listener)
  }

  addFeedProvider(provider: FeedProvider): void {
    this.providers.push(provider)
  }

  decorateSource(sourceType: string, decorator: SourceDecorator): void {
    this.decorators.set(sourceType, decorator)
  }

  /**
   * Events another module keeps in sync with its own records (interview stages): the calendar can't delete
   * them while `owns(sourceId, eventId)` (the record still points at this very event), the next sync would
   * bring them back. `hint` tells the user where to do it.
   */
  ownSource(
    sourceType: string,
    hint: string,
    owns: (sourceId: string, eventId: string) => boolean
  ): void {
    this.owners.set(sourceType, { hint, owns })
  }

  /** Hides events whose owner is in the trash for now (stage events of a vacancy): see aliveWhere. */
  hideWhen(alive: SQL, parentHint: string): void {
    this.descriptor.aliveWhere = this.descriptor.aliveWhere
      ? and(this.descriptor.aliveWhere, alive)
      : alive
    this.descriptor.parentHint = parentHint
  }

  constructor(m: ModuleContext) {
    this.descriptor = {
      type: 'event',
      table: events,
      searchDoc: (r) => ({ title: r.title, body: r.description }),
      textField: { column: 'description', max: fieldMax(eventInputSchema.shape.description) },
      summary: (r) => ({
        title: r.title,
        subtitle: r.allDay ? fmtDayFull(r.startAt) : fmtDateTime(r.startAt)
      }),
      systemFields: ['remindedFor', 'reminded2For'],
      // An edit moved the event (→ a job stage followed it); «Скасувати» moves it back: the stage follows again.
      afterRevert: (row, before) => {
        if (row.startAt !== before.startAt || row.endAt !== before.endAt) {
          for (const l of this.listeners) l(row as EventRow)
        }
      }
    }
    this.repo = new SoftRepository(m.repo, this.descriptor, (r, tags) => ({
      ...r,
      recurrence: r.recurrence as Recurrence,
      tags
    }))
  }

  /** Events that may have occurrences in range (non-recurring in range + all recurring that started before `to`). */
  eventsInRange(from: number, to: number): CalendarEvent[] {
    return this.repo.listWhere(
      [
        or(
          and(
            eq(events.recurrence, 'none'),
            lte(events.startAt, to),
            or(gte(events.startAt, from), gte(events.endAt, from))
          ),
          and(ne(events.recurrence, 'none'), lte(events.startAt, to))
        ),
        this.descriptor.aliveWhere
      ],
      [asc(events.startAt)]
    )
  }

  feed(from: number, to: number): CalendarItem[] {
    const items: CalendarItem[] = []
    for (const e of this.eventsInRange(from, to)) {
      const extra = e.sourceType ? (this.decorators.get(e.sourceType)?.(e) ?? null) : null
      for (const start of occurrences(e, from, to)) {
        items.push({
          key: `event:${e.id}:${start}`,
          source: 'event',
          ref: { type: 'event', id: e.id },
          title: e.title,
          startAt: start,
          endAt: e.endAt ? start + (e.endAt - e.startAt) : null,
          allDay: e.allDay,
          color: e.color,
          done: false,
          ...extra
        })
      }
    }
    for (const provider of this.providers) items.push(...provider(from, to))
    return items.sort((a, b) => a.startAt - b.startAt)
  }

  api(): EventsApi {
    const repo = this.repo
    return {
      list: async (query) => {
        const page = pageSchema.parse(query ?? {})
        return repo.listWhere(
          [this.descriptor.aliveWhere],
          [asc(events.startAt)],
          page.limit,
          page.offset
        )
      },
      get: async (id) => repo.get(idArg.parse(id)),
      create: async (input) => {
        const [data, tagIds] = splitTags(eventInputSchema.parse(input))
        return repo.insert(
          { ...data, remindedFor: null, reminded2For: null, sourceType: null, sourceId: null },
          tagIds
        )
      },
      update: async (args) => {
        const { id, patch } = updateArgs(eventPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        // Changing time or reminder re-arms the reminder.
        const rearm =
          data.startAt !== undefined ||
          data.remindMinutes !== undefined ||
          data.remind2Minutes !== undefined ||
          data.recurrence !== undefined
        const updated = repo.patch(
          id,
          { ...data, ...(rearm ? { remindedFor: null, reminded2For: null } : {}) },
          tagIds
        )
        if (data.startAt !== undefined || data.endAt !== undefined) {
          const row = repo.row(id)
          if (row) for (const l of this.listeners) l(row)
        }
        return updated
      },
      remove: async (id) => {
        const eventId = idArg.parse(id)
        const row = repo.row(eventId)
        const owner = row?.sourceType ? this.owners.get(row.sourceType) : undefined
        if (owner && row?.sourceId && owner.owns(row.sourceId, row.id))
          throw new UserError(owner.hint)
        repo.softDelete(eventId)
      },
      feed: async (range) => {
        const { from, to } = rangeSchema.parse(range)
        return this.feed(from, to)
      }
    }
  }
}
