import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { FreelanceApi } from '@shared/api'
import { statsQuerySchema, type FreelanceStats, type FunnelRow, type ProposalStatus } from '@shared/domain/freelance'
import { messageTemplates, platforms, proposals } from '../../db/schema'
import type { Orm } from '../../db/client'
import { addDays, dayKey, now, pct, startOfDay, startOfWeek } from '../../core/util'
import type { ModuleContext } from '../context'
import { RANK, type ProposalRow } from './shared'

/** Proposal funnel statistics: overall and per niche / template / platform, weekly activity. */
export class ProposalStats {
  constructor(private readonly m: ModuleContext) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  private funnel(key: string, label: string, rows: ProposalRow[]): FunnelRow {
    const sent = rows.filter((r) => r.status !== 'draft')
    const replied = sent.filter(
      (r) => r.repliedAt !== null || (RANK[r.status as ProposalStatus] ?? 0) >= 3
    ).length
    const interview = sent.filter(
      (r) => (RANK[r.status as ProposalStatus] ?? 0) >= 4 || r.hiredAt !== null
    ).length
    const hired = sent.filter((r) => r.status === 'hired' || r.hiredAt !== null).length
    return {
      key,
      label,
      sent: sent.length,
      replied,
      interview,
      hired,
      replyRate: pct(replied, sent.length),
      hireRate: pct(hired, sent.length),
      credits: sent.reduce((s, r) => s + r.credits + r.boostCredits, 0)
    }
  }

  stats(query: z.input<typeof statsQuerySchema>): FreelanceStats {
    const q = statsQuerySchema.parse(query ?? {})
    const to = q.to ?? now()
    const from = q.from ?? addDays(startOfDay(to), -89)
    const rows = this.db
      .select()
      .from(proposals)
      .where(
        and(
          isNull(proposals.deletedAt),
          q.platformId ? eq(proposals.platformId, q.platformId) : undefined,
          gte(sql`coalesce(${proposals.sentAt}, ${proposals.createdAt})`, from),
          lte(sql`coalesce(${proposals.sentAt}, ${proposals.createdAt})`, to)
        )
      )
      .all()
    const group = (
      keyOf: (r: ProposalRow) => string,
      labelOf: (k: string) => string
    ): FunnelRow[] => {
      const map = new Map<string, ProposalRow[]>()
      for (const r of rows) map.set(keyOf(r), [...(map.get(keyOf(r)) ?? []), r])
      return [...map.entries()]
        .map(([k, list]) => this.funnel(k, labelOf(k), list))
        .filter((f) => f.sent > 0)
        .sort((a, b) => b.sent - a.sent)
    }
    const templateTitles = new Map(
      this.db
        .select({ id: messageTemplates.id, title: messageTemplates.title })
        .from(messageTemplates)
        .all()
        .map((t) => [t.id, t.title])
    )
    const platformNames = new Map(
      this.db
        .select({ id: platforms.id, name: platforms.name })
        .from(platforms)
        .all()
        .map((p) => [p.id, p.name])
    )

    // Keyed by local date: a 25-hour DST week would knock numeric `+ 7 * DAY_MS` keys off Monday midnight.
    const weeks = new Map<string, { sent: number; replied: number; hired: number }>()
    for (let w = startOfWeek(from); w <= to; w = addDays(w, 7))
      weeks.set(dayKey(w), { sent: 0, replied: 0, hired: 0 })
    for (const r of rows) {
      if (r.status === 'draft') continue
      const b = weeks.get(dayKey(startOfWeek(r.sentAt ?? r.createdAt)))
      if (!b) continue
      b.sent++
      if (r.repliedAt) b.replied++
      if (r.hiredAt) b.hired++
    }
    const replyTimes = rows
      .filter((r) => r.repliedAt && r.sentAt)
      .map((r) => (r.repliedAt! - r.sentAt!) / 3600_000)
    return {
      range: { from, to },
      totals: this.funnel('all', 'Усі', rows),
      byNiche: group(
        (r) => r.niche || '—',
        (k) => (k === '—' ? 'Без типу' : k)
      ),
      byTemplate: group(
        (r) => r.templateId ?? '—',
        (k) => (k === '—' ? 'Без шаблону' : (templateTitles.get(k) ?? 'Видалений шаблон'))
      ),
      byPlatform: group(
        (r) => r.platformId,
        (k) => platformNames.get(k) ?? '—'
      ),
      weekly: [...weeks.entries()].map(([week, v]) => ({ week, ...v })),
      avgReplyHours: replyTimes.length
        ? Math.round((replyTimes.reduce((s, x) => s + x, 0) / replyTimes.length) * 10) / 10
        : null
    }
  }

  api(): FreelanceApi {
    return { stats: async (query) => this.stats(query ?? {}) }
  }
}
