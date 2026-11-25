import { log } from '../core/logger'
import { showNotification } from '../core/notify'
import { eq } from 'drizzle-orm'
import { ENTITY_META } from '@shared/entity-types'
import { fmtWhen } from '@shared/dates'
import { events } from '../db/schema'
import type { DbContext } from '../db/client'
import type { CalendarModule } from '../modules/calendar'
import { occurrences } from '../modules/calendar'
import type { BoardsModule } from '../modules/boards'
import type { JobsModule } from '../modules/jobs'
import type { ConfigStore } from '../core/config-store'
import { addDays, DAY_MS, dayKey, now, startOfDay, startOfWeek } from '../core/util'

const TICK_MS = 30_000
/** Reminders older than this (app was closed) are skipped instead of spamming on startup. */
const STALE_MS = 15 * 60_000
/** All-day card deadlines (stored as 00:00) are announced in the morning, not at midnight. */
const CARD_DAY_NUDGE_HOUR = 9

const isAllDay = (ts: number): boolean => {
  const d = new Date(ts)
  return d.getHours() === 0 && d.getMinutes() === 0
}

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
      log.error('[reminders]', e)
    }
  }

  private notify(title: string, body: string, route: string): void {
    showNotification({ title, body, icon: this.icon, silent: false }, () => this.open(route))
  }

  tick(): void {
    const t = now()
    for (const e of this.calendar.eventsInRange(t - DAY_MS, t + 31 * DAY_MS)) {
      const slots: {
        minutes: number | null
        sent: number | null
        field: 'remindedFor' | 'reminded2For'
      }[] = [
        { minutes: e.remindMinutes, sent: e.remindedFor, field: 'remindedFor' },
        { minutes: e.remind2Minutes, sent: e.reminded2For, field: 'reminded2For' }
      ]
      for (const slot of slots) {
        if (slot.minutes === null) continue
        for (const start of occurrences(e, t - DAY_MS, t + 31 * DAY_MS)) {
          const remindAt = start - slot.minutes * 60_000
          if (remindAt > t || remindAt < t - STALE_MS) continue
          if (slot.sent !== null && slot.sent >= start) continue
          this.notify(e.title, fmtWhen(start, e.allDay), ENTITY_META.event.route(e.id))
          this.ctx.orm
            .update(events)
            .set({ [slot.field]: start })
            .where(eq(events.id, e.id))
            .run()
        }
      }
    }
    for (const c of this.boards.due({ from: Math.max(this.lastTick, t - STALE_MS), to: t })) {
      if (c.columnIsDone || c.dueAt! <= this.lastTick || isAllDay(c.dueAt!)) continue
      this.notify(`Дедлайн: ${c.title}`, c.boardTitle, ENTITY_META.card.route(c.id))
    }
    this.cardDayNudge(t)
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
    const week = new Date(startOfWeek(t)).toDateString()
    if (this.config.lastWeeklyReview === week) return
    this.config.lastWeeklyReview = week
    this.notify(
      'Підсумки тижня готові',
      'Що зроблено, гроші, відгуки без відповіді й плани на наступний тиждень',
      '/review'
    )
  }

  /**
   * Morning reminder about today's all-day card deadlines, once a day. At midnight a sleeping laptop or a
   * closed Vault missed them entirely, and 00:00 is no time to be reminded anyway.
   */
  private cardDayNudge(t: number): void {
    const key = dayKey(t)
    if (this.config.lastCardNudge === key || new Date(t).getHours() < CARD_DAY_NUDGE_HOUR) return
    this.config.lastCardNudge = key
    const day = startOfDay(t)
    const due = this.boards
      .due({ from: day, to: addDays(day, 1) - 1 })
      .filter((c) => !c.columnIsDone && isAllDay(c.dueAt!))
    if (!due.length) return
    const route = due.length === 1 ? ENTITY_META.card.route(due[0].id) : '/boards'
    const names = due
      .slice(0, 3)
      .map((c) => c.title)
      .join(', ')
    this.notify(
      'Сьогодні дедлайн',
      due.length > 3 ? `${names} і ще ${due.length - 3}` : names,
      route
    )
  }

  /** Evening reminder: job boards expected today that are not marked yet. */
  private jobNudge(t: number): void {
    const at = this.config.settings.jobReminderTime
    if (!at) return
    const [h, m] = at.split(':').map(Number)
    const d = new Date(t)
    const key = dayKey(t)
    if (this.config.lastJobNudge === key || d.getHours() * 60 + d.getMinutes() < h * 60 + m) return
    this.config.lastJobNudge = key
    const pending = this.jobs.pendingToday()
    if (!pending.length) return
    this.notify(
      'Пошук роботи: майданчики на сьогодні',
      `Не позначено: ${pending.map((b) => b.name).join(', ')}`,
      '/jobs'
    )
  }
}
