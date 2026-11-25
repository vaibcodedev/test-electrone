import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import type { EntityType } from '@shared/entity-types'
import type { EntitySummary } from '@shared/domain/common'
import type { DashboardData } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { bookmarks, cards, ideas } from '../db/schema'
import type { AnyRow, EntityRegistry } from '../core/registry'
import { addDays, dayKey, endOfDay, now, startOfDay, startOfWeek } from '../core/util'
import type { PinService } from './pin-service'
import type { BoardsModule } from '../modules/boards'
import type { CalendarModule } from '../modules/calendar'
import type { CrmModule } from '../modules/crm'
import type { EnglishModule } from '../modules/english'
import type { IdeasModule } from '../modules/ideas'
import type { KnowledgeModule } from '../modules/knowledge'
import type { ChecklistsModule } from '../modules/checklists'

/** Read model for the home screen. Aggregates across modules; never writes. */
export class DashboardService {
  constructor(
    private readonly ctx: DbContext,
    private readonly registry: EntityRegistry,
    private readonly pins: PinService,
    private readonly mods: {
      boards: BoardsModule
      calendar: CalendarModule
      crm: CrmModule
      english: EnglishModule
      ideas: IdeasModule
      knowledge: KnowledgeModule
      checklists: ChecklistsModule
    }
  ) {}

  /** Recently changed live records across modules; `types` narrows the scan to those descriptors. */
  recent(limit = 10, types?: readonly EntityType[]): EntitySummary[] {
    const all: EntitySummary[] = []
    const only = types ? new Set(types) : null
    for (const d of this.registry.all()) {
      if (only && !only.has(d.type)) continue
      const rows = this.ctx.orm
        .select()
        .from(d.table)
        .where(this.registry.live(d))
        .orderBy(desc(d.table.updatedAt))
        .limit(limit)
        .all() as AnyRow[]
      for (const r of rows)
        all.push({ type: d.type, id: r.id, ...d.summary(r), updatedAt: r.updatedAt })
    }
    return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, limit)
  }

  private counts(): Partial<Record<EntityType, number>> {
    const out: Partial<Record<EntityType, number>> = {}
    for (const d of this.registry.all()) {
      out[d.type] =
        this.ctx.orm
          .select({ c: sql<number>`count(*)` })
          .from(d.table)
          .where(this.registry.live(d))
          .get()?.c ?? 0
    }
    return out
  }

  private activity(): { day: string; count: number }[] {
    const from = addDays(startOfDay(now()), -13)
    const done = this.ctx.orm
      .select({ at: cards.completedAt })
      .from(cards)
      .where(
        and(
          this.registry.live(this.registry.get('card')),
          isNotNull(cards.completedAt),
          gte(cards.completedAt, from)
        )
      )
      .all()
      .map((r) => r.at!)
    const checks = this.mods.checklists.doneSince(from).map((r) => r.doneAt)
    const buckets = new Map<string, number>()
    for (const at of [...done, ...checks]) {
      const day = dayKey(at)
      buckets.set(day, (buckets.get(day) ?? 0) + 1)
    }
    return Array.from({ length: 14 }, (_, i) => {
      const day = dayKey(addDays(from, i))
      return { day, count: buckets.get(day) ?? 0 }
    })
  }

  get(): DashboardData {
    const t = now()
    const todayStart = startOfDay(t)
    const todayEnd = endOfDay(t)
    const dueToday = this.mods.boards.due({ from: todayStart, to: todayEnd })
    const overdue = this.mods.boards
      .due({ from: 0, to: todayStart - 1 })
      .filter((c) => !c.columnIsDone)
      .slice(-20)
    return {
      today: {
        cards: dueToday,
        overdue,
        agenda: this.mods.calendar
          .feed(todayStart, addDays(todayEnd, 2))
          .filter((i) => i.source !== 'card')
      },
      pinned: this.pins.list('pin'),
      recent: this.recent(10),
      inboxIdeas: this.mods.ideas.repo.listWhere([eq(ideas.status, 'inbox')], undefined, 6),
      reading: this.mods.knowledge.bookmarkRepo.listWhere(
        [eq(bookmarks.status, 'in_progress')],
        undefined,
        5
      ),
      english: {
        due: this.mods.english.dueCount(),
        total: this.counts().word ?? 0,
        wordOfDay: this.mods.english.wordOfDay()
      },
      timer: this.mods.crm.running(),
      weekMinutes: this.mods.crm.minutesInRange(startOfWeek(t), t),
      counts: this.counts(),
      activity: this.activity()
    }
  }
}
