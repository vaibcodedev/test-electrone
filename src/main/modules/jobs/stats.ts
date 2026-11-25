import { and, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { ApplicationStatus, JobFunnelRow, JobStats, StageKind } from '@shared/domain/jobs'
import { applications, applicationStages, messageTemplates, resumes } from '../../db/schema'
import type { Orm } from '../../db/client'
import { addDays, DAY_MS, dayKey, now, pct, startOfDay, startOfWeek } from '../../core/util'
import type { ModuleContext } from '../context'
import type { JobBoards } from './boards'
import { REPLIED, type AppRow } from './shared'

/** Job search statistics: the funnel overall and per board / resume / template, weekly activity. */
export class JobStatistics {
  constructor(
    private readonly m: ModuleContext,
    private readonly boards: JobBoards
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  private funnel(key: string, label: string, rows: AppRow[], stageApps: Set<string>): JobFunnelRow {
    const sent = rows.filter((r) => r.status !== 'saved')
    const replied = sent.filter(
      (r) => r.repliedAt !== null || REPLIED.includes(r.status as ApplicationStatus)
    ).length
    const interview = sent.filter(
      (r) => stageApps.has(r.id) || ['interview', 'offer', 'accepted'].includes(r.status)
    ).length
    const offer = sent.filter((r) => r.status === 'offer' || r.status === 'accepted').length
    return {
      key,
      label,
      applied: sent.length,
      replied,
      interview,
      offer,
      replyRate: pct(replied, sent.length),
      offerRate: pct(offer, sent.length)
    }
  }

  stats(q: { from?: number; to?: number }): JobStats {
    const to = q.to ?? now()
    const from = q.from ?? addDays(startOfDay(to), -89)
    const rows = this.db
      .select()
      .from(applications)
      .where(
        and(
          isNull(applications.deletedAt),
          gte(sql`coalesce(${applications.appliedAt}, ${applications.createdAt})`, from),
          lte(sql`coalesce(${applications.appliedAt}, ${applications.createdAt})`, to)
        )
      )
      .all()
    const stages = rows.length
      ? this.db
          .select()
          .from(applicationStages)
          .where(
            inArray(
              applicationStages.applicationId,
              rows.map((r) => r.id)
            )
          )
          .all()
      : []
    const interviewApps = new Set(
      stages.filter((s) => s.kind !== 'test_task').map((s) => s.applicationId)
    )
    const boardNames = new Map(this.boards.list(true).map((b) => [b.id, b.name]))
    const resumeNames = new Map(
      this.db
        .select({ id: resumes.id, title: resumes.title })
        .from(resumes)
        .all()
        .map((r) => [r.id, r.title])
    )
    const templateNames = new Map(
      this.db
        .select({ id: messageTemplates.id, title: messageTemplates.title })
        .from(messageTemplates)
        .all()
        .map((t) => [t.id, t.title])
    )
    const group = (
      keyOf: (r: AppRow) => string,
      labelOf: (k: string) => string
    ): JobFunnelRow[] => {
      const map = new Map<string, AppRow[]>()
      for (const r of rows) map.set(keyOf(r), [...(map.get(keyOf(r)) ?? []), r])
      return [...map.entries()]
        .map(([k, list]) => this.funnel(k, labelOf(k), list, interviewApps))
        .filter((f) => f.applied > 0)
        .sort((a, b) => b.applied - a.applied)
    }
    const weeks = new Map<string, { applied: number; replied: number }>()
    for (let w = startOfWeek(from); w <= to; w = addDays(w, 7))
      weeks.set(dayKey(w), { applied: 0, replied: 0 })
    for (const r of rows) {
      if (r.status === 'saved') continue
      const b = weeks.get(dayKey(startOfWeek(r.appliedAt ?? r.createdAt)))
      if (!b) continue
      b.applied++
      if (r.repliedAt) b.replied++
    }
    const replyDays = rows
      .filter((r) => r.repliedAt && r.appliedAt)
      .map((r) => (r.repliedAt! - r.appliedAt!) / DAY_MS)
    const kinds = new Map<StageKind, { total: number; passed: number }>()
    for (const s of stages) {
      const k = kinds.get(s.kind as StageKind) ?? { total: 0, passed: 0 }
      k.total++
      if (s.status === 'passed') k.passed++
      kinds.set(s.kind as StageKind, k)
    }
    return {
      range: { from, to },
      totals: this.funnel('all', 'Усі', rows, interviewApps),
      byBoard: group(
        (r) => r.boardId ?? '—',
        (k) => boardNames.get(k) ?? 'Без майданчика'
      ),
      byResume: group(
        (r) => r.resumeId ?? '—',
        (k) => resumeNames.get(k) ?? 'Без резюме'
      ),
      byTemplate: group(
        (r) => r.templateId ?? '—',
        (k) => templateNames.get(k) ?? 'Без шаблону'
      ),
      weekly: [...weeks.entries()].map(([week, v]) => ({ week, ...v })),
      avgReplyDays: replyDays.length
        ? Math.round((replyDays.reduce((s, x) => s + x, 0) / replyDays.length) * 10) / 10
        : null,
      stagesByKind: [...kinds.entries()].map(([kind, v]) => ({ kind, ...v }))
    }
  }
}
