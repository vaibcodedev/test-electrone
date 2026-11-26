/**
 * «Експорт .ics» of the calendar: a one-off snapshot file for a phone or another calendar (not a subscription).
 * Own events go whole, with RRULE and reminders; other modules' items — single events from one month back to twelve
 * months ahead, without the completed ones. Only titles and dates of those items: nothing secret (access secrets
 * never reach the feed), no amounts beyond the titles the calendar already shows.
 */
import { writeFileSync } from 'fs'
import type { EventsApi } from '@shared/api'
import {
  CALENDAR_SOURCE_LABEL,
  ICS_SOURCE_ITEMS,
  icsExportSchema,
  type IcsSource
} from '@shared/domain/calendar'
import type { CalendarModule } from '../modules/calendar'
import { buildIcs, rruleFor, type IcsEvent } from '../core/ics'
import { log } from '../core/logger'
import { dayKey, endOfDay, now, startOfDay, UserError } from '../core/util'

/** Asks where to save (main's own dialog); null — cancelled. */
export type PickSavePath = (defaultName: string) => Promise<string | null>

const addMonths = (ts: number, n: number): number => {
  const d = new Date(ts)
  d.setMonth(d.getMonth() + n)
  return d.getTime()
}

export class CalendarExportService {
  constructor(
    private readonly calendar: CalendarModule,
    private readonly pickPath: PickSavePath
  ) {}

  /** The file's text and the number of events in it. */
  build(sources: IcsSource[], at: number = now()): { text: string; count: number } {
    const from = addMonths(startOfDay(at), -1)
    const to = endOfDay(addMonths(at, 12))
    const wanted = new Set(sources.flatMap((s) => ICS_SOURCE_ITEMS[s]))
    const { own, items } = this.calendar.exportData(from, to)
    const out: IcsEvent[] = []
    if (wanted.has('event')) {
      for (const e of own) {
        out.push({
          uid: `event-${e.id}@vault`,
          title: e.title,
          description: e.description,
          start: e.startAt,
          end: e.endAt,
          allDay: e.allDay,
          rrule: rruleFor(e.recurrence, e.startAt),
          alarms: [e.remindMinutes, e.remind2Minutes].filter((m): m is number => m !== null)
        })
      }
    }
    for (const { item, uid } of items) {
      if (item.done || !wanted.has(item.source)) continue
      out.push({
        uid: `${uid}@vault`,
        title: item.title,
        category: CALENDAR_SOURCE_LABEL[item.source],
        start: item.startAt,
        end: item.endAt,
        allDay: item.allDay
      })
    }
    return { text: buildIcs(out, { now: at, name: 'Vault' }), count: out.length }
  }

  api(): Pick<EventsApi, 'exportIcs'> {
    return {
      exportIcs: async (input) => {
        const { sources } = icsExportSchema.parse(input)
        const path = await this.pickPath(`vault-calendar-${dayKey(now())}.ics`)
        if (!path) return null
        const { text, count } = this.build(sources)
        try {
          writeFileSync(path, text, 'utf8')
        } catch (error) {
          log.warn('calendar export: write failed', error)
          throw new UserError(
            'Не вдалося зберегти файл. Виберіть іншу папку або закрийте програму, у якій він відкритий'
          )
        }
        return { path, count }
      }
    }
  }
}
