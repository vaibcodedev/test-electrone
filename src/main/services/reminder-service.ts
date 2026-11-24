import { Notification } from 'electron'
import { eq } from 'drizzle-orm'
import { ENTITY_META } from '@shared/entity-types'
import { events } from '../db/schema'
import type { DbContext } from '../db/client'
import type { CalendarModule } from '../modules/calendar'
import { occurrences } from '../modules/calendar'
import type { BoardsModule } from '../modules/boards'
import { DAY_MS, now } from '../core/util'

const TICK_MS = 30_000
/** Reminders older than this (app was closed) are skipped instead of spamming on startup. */
const STALE_MS = 15 * 60_000

/** Fires OS notifications for calendar reminders and card deadlines. */
export class ReminderService {
  private timer: NodeJS.Timeout | null = null
  private lastTick = now() - TICK_MS

  constructor(
    private readonly ctx: DbContext,
    private readonly calendar: CalendarModule,
    private readonly boards: BoardsModule,
    private readonly open: (route: string) => void,
    private readonly icon: string
  ) {}

  start(): void {
    this.stop()
    this.timer = setInterval(() => this.safeTick(), TICK_MS)
    setTimeout(() => this.safeTick(), 5000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private safeTick(): void {
    try {
      this.tick()
    } catch (e) {
      console.error('[reminders]', e)
    }
  }

  private notify(title: string, body: string, route: string): void {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, icon: this.icon, silent: false })
    n.on('click', () => this.open(route))
    n.show()
  }

  tick(): void {
    const t = now()
    for (const e of this.calendar.eventsInRange(t - DAY_MS, t + 31 * DAY_MS)) {
      if (e.remindMinutes === null) continue
      const lead = e.remindMinutes * 60_000
      for (const start of occurrences(e, t - DAY_MS, t + 31 * DAY_MS)) {
        const remindAt = start - lead
        if (remindAt > t || remindAt < t - STALE_MS) continue
        if (e.remindedFor !== null && e.remindedFor >= start) continue
        const when = new Date(start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        this.notify(e.title, e.allDay ? 'Сегодня' : `В ${when}`, ENTITY_META.event.route(e.id))
        this.ctx.orm.update(events).set({ remindedFor: start }).where(eq(events.id, e.id)).run()
      }
    }
    for (const c of this.boards.due({ from: Math.max(this.lastTick, t - STALE_MS), to: t })) {
      if (c.columnIsDone || c.dueAt! <= this.lastTick) continue
      this.notify(`Дедлайн: ${c.title}`, c.boardTitle, ENTITY_META.card.route(c.id))
    }
    this.lastTick = t
  }
}
