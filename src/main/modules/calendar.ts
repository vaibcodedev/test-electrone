/** Calendar events with recurrence + an aggregated feed (cards, payments, project deadlines). */
import { and, asc, gte, isNull, lte, ne, or, eq } from 'drizzle-orm'
import type { EventsApi } from '@shared/api'
import {
  eventInputSchema,
  eventPatchSchema,
  rangeSchema,
  type CalendarEvent,
  type CalendarItem,
  type Recurrence
} from '@shared/domain/calendar'
import { events, projects } from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'
import type { BoardsModule } from './boards'
import type { CrmModule } from './crm'

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

const PROJECT_COLOR = '#7c8cf8'
const PAYMENT_COLOR = '#f5a524'

type EventListener = (e: EventRow) => void
/** Extra calendar items contributed by other modules (subscriptions, follow-ups…). */
export type FeedProvider = (from: number, to: number) => CalendarItem[]
/** Decorates events owned by another module (interview stages → open the vacancy). */
export type SourceDecorator = (e: CalendarEvent) => Partial<CalendarItem> | null

export class CalendarModule {
  readonly descriptor: EntityDescriptor
  readonly repo: SoftRepository<EventRow, CalendarEvent>
  private readonly listeners: EventListener[] = []
  private readonly providers: FeedProvider[] = []
  private readonly decorators = new Map<string, SourceDecorator>()

  onEventChanged(listener: EventListener): void {
    this.listeners.push(listener)
  }

  addFeedProvider(provider: FeedProvider): void {
    this.providers.push(provider)
  }

  decorateSource(sourceType: string, decorator: SourceDecorator): void {
    this.decorators.set(sourceType, decorator)
  }

  constructor(
    private readonly m: ModuleContext,
    private readonly boards: BoardsModule,
    private readonly crm: CrmModule
  ) {
    this.descriptor = {
      type: 'event',
      table: events,
      searchDoc: (r) => ({ title: r.title, body: r.description }),
      summary: (r) => ({
        title: r.title,
        subtitle: new Date(r.startAt).toLocaleString('uk-UA', {
          dateStyle: 'medium',
          timeStyle: r.allDay ? undefined : 'short'
        })
      })
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
        )
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
    for (const c of this.boards.due({ from, to })) {
      items.push({
        key: `card:${c.id}`,
        source: 'card',
        ref: { type: 'card', id: c.id },
        title: c.title,
        startAt: c.dueAt!,
        endAt: null,
        allDay: new Date(c.dueAt!).getHours() === 0 && new Date(c.dueAt!).getMinutes() === 0,
        color: null,
        done: c.columnIsDone
      })
    }
    for (const p of this.crm.paymentsDue(from, to)) {
      items.push({
        key: `payment:${p.id}`,
        source: 'payment',
        ref: { type: 'project', id: p.projectId },
        title: `Оплата ${p.amount} ${p.currency} · ${p.projectTitle}`,
        startAt: p.dueAt!,
        endAt: null,
        allDay: true,
        color: PAYMENT_COLOR,
        done: p.status === 'paid' || p.status === 'cancelled'
      })
    }
    const deadlines = this.m.db.orm
      .select({
        id: projects.id,
        title: projects.title,
        dueAt: projects.dueAt,
        status: projects.status
      })
      .from(projects)
      .where(and(isNull(projects.deletedAt), gte(projects.dueAt, from), lte(projects.dueAt, to)))
      .all()
    for (const p of deadlines) {
      items.push({
        key: `project:${p.id}`,
        source: 'project',
        ref: { type: 'project', id: p.id },
        title: `Дедлайн: ${p.title}`,
        startAt: p.dueAt!,
        endAt: null,
        allDay: true,
        color: PROJECT_COLOR,
        done: p.status === 'done' || p.status === 'cancelled'
      })
    }
    for (const provider of this.providers) items.push(...provider(from, to))
    return items.sort((a, b) => a.startAt - b.startAt)
  }

  api(): EventsApi {
    const repo = this.repo
    return {
      list: async () => repo.listWhere([], [asc(events.startAt)]),
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
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      feed: async (range) => {
        const { from, to } = rangeSchema.parse(range)
        return this.feed(from, to)
      }
    }
  }
}
