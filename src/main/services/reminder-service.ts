import { Notification } from 'electron'
import { eq } from 'drizzle-orm'
import { ENTITY_META } from '@shared/entity-types'
import { events } from '../db/schema'
import type { DbContext } from '../db/client'
import type { CalendarModule } from '../modules/calendar'
import { occurrences } from '../modules/calendar'
import type { BoardsModule } from '../modules/boards'
import type { JobsModule } from '../modules/jobs'
import type { ConfigStore } from '../core/config-store'
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
    private readonly icon: string,
    private readonly jobs: JobsModule,
    private readonly config: ConfigStore
  ) {}

  private lastJobNudge = ''

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
      const slots: { minutes: number | null; sent: number | null; field: 'remindedFor' | 'reminded2For' }[] = [
        { minutes: e.remindMinutes, sent: e.remindedFor, field: 'remindedFor' },
        { minutes: e.remind2Minutes, sent: e.reminded2For, field: 'reminded2For' }
      ]
      for (const slot of slots) {
        if (slot.minutes === null) continue
        for (const start of occurrences(e, t - DAY_MS, t + 31 * DAY_MS)) {
          const remindAt = start - slot.minutes * 60_000
          if (remindAt > t || remindAt < t - STALE_MS) continue
          if (slot.sent !== null && slot.sent >= start) continue
          const d = new Date(start)
          const when = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          const isToday = new Date().toDateString() === d.toDateString()
          const body = e.allDay ? (isToday ? 'Сегодня' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })) : isToday ? `Сегодня в ${when}` : `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${when}`
          this.notify(e.title, body, ENTITY_META.event.route(e.id))
          this.ctx.orm.update(events).set({ [slot.field]: start }).where(eq(events.id, e.id)).run()
        }
      }
    }
    for (const c of this.boards.due({ from: Math.max(this.lastTick, t - STALE_MS), to: t })) {
      if (c.columnIsDone || c.dueAt! <= this.lastTick) continue
      this.notify(`Дедлайн: ${c.title}`, c.boardTitle, ENTITY_META.card.route(c.id))
    }
    this.jobNudge(t)
    this.weeklyNudge(t)
    this.lastTick = t
  }

  /** Weekly review notification (default: Sunday 18:00), once per week. */
  private weeklyNudge(t: number): void {
    const { weeklyReviewDay, weeklyReviewTime } = this.config.settings
    if (!weeklyReviewTime) return
    const d = new Date(t)
    const [h, m] = weeklyReviewTime.split(':').map(Number)
    if (d.getDay() !== weeklyReviewDay || d.getHours() * 60 + d.getMinutes() < h * 60 + m) return
    const week = new Date(t - ((d.getDay() + 6) % 7) * DAY_MS).toDateString()
    if (this.config.lastWeeklyReview === week) return
    this.config.lastWeeklyReview = week
    this.notify('Итоги недели готовы', 'Что сделано, деньги, отклики без ответа и планы на следующую неделю', '/review')
  }

  /** Evening reminder: job boards expected today that are not marked yet. */
  private jobNudge(t: number): void {
    const at = this.config.settings.jobReminderTime
    if (!at) return
    const [h, m] = at.split(':').map(Number)
    const d = new Date(t)
    const key = d.toDateString()
    if (this.lastJobNudge === key || d.getHours() * 60 + d.getMinutes() < h * 60 + m) return
    this.lastJobNudge = key
    const pending = this.jobs.pendingToday()
    if (!pending.length) return
    this.notify('Поиск работы: площадки на сегодня', `Не отмечены: ${pending.map((b) => b.name).join(', ')}`, '/jobs')
  }
}
