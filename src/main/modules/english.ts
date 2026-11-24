/**
 * English vocabulary from work with spaced repetition (SM-2 variant with 4 grades).
 * Grades: 0 forgot · 1 hard · 2 good · 3 easy.
 */
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import type { EnglishApi } from '@shared/api'
import {
  reviewInputSchema,
  WORD_STAGES,
  wordInputSchema,
  wordListQuerySchema,
  wordPatchSchema,
  type EnglishStats,
  type ReviewGrade,
  type Word,
  type WordKind,
  type WordStage
} from '@shared/domain/english'
import { z } from 'zod'
import { wordReviews, words } from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { DAY_MS, newId, now, startOfDay } from '../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'

type WordRow = typeof words.$inferSelect

export function stageOf(r: Pick<WordRow, 'repetitions' | 'intervalDays' | 'lastReviewedAt'>): WordStage {
  if (!r.lastReviewedAt) return 'new'
  if (r.intervalDays >= 30) return 'mastered'
  if (r.intervalDays >= 7) return 'review'
  return 'learning'
}

/** Pure SM-2 step. Exported for unit tests. */
export function schedule(
  state: Pick<WordRow, 'ease' | 'intervalDays' | 'repetitions' | 'lapses'>,
  grade: ReviewGrade,
  at: number
): Pick<WordRow, 'ease' | 'intervalDays' | 'repetitions' | 'lapses' | 'dueAt' | 'lastReviewedAt'> {
  const q = [1, 3, 4, 5][grade]
  let { ease, intervalDays, repetitions, lapses } = state
  if (q < 3) {
    repetitions = 0
    lapses += 1
    intervalDays = 0
    ease = Math.max(1.3, ease - 0.2)
    // Show again in 10 minutes in the same session.
    return { ease, intervalDays, repetitions, lapses, dueAt: at + 10 * 60_000, lastReviewedAt: at }
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  if (repetitions === 0) intervalDays = q === 5 ? 3 : 1
  else if (repetitions === 1) intervalDays = q === 5 ? 7 : q === 3 ? 3 : 4
  else intervalDays = Math.round(intervalDays * ease * (q === 3 ? 0.8 : q === 5 ? 1.3 : 1))
  intervalDays = Math.min(intervalDays, 365)
  repetitions += 1
  return { ease, intervalDays, repetitions, lapses, dueAt: startOfDay(at + intervalDays * DAY_MS) + 4 * 3600_000, lastReviewedAt: at }
}

export class EnglishModule {
  readonly descriptor: EntityDescriptor
  readonly repo: SoftRepository<WordRow, Word>

  constructor(private readonly m: ModuleContext) {
    this.descriptor = {
      type: 'word',
      table: words,
      searchDoc: (r) => ({
        title: r.term,
        body: `${r.translation}\n${r.example}\n${r.exampleTranslation}\n${r.context}\n${r.notes}`
      }),
      summary: (r) => ({ title: r.term, subtitle: r.translation || undefined })
    }
    this.repo = new SoftRepository(m.repo, this.descriptor, (r, tags) => ({
      ...r,
      kind: r.kind as WordKind,
      stage: stageOf(r),
      tags
    }))
  }

  private get db() {
    return this.m.db.orm
  }

  dueCount(): number {
    return (
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(words)
        .where(and(isNull(words.deletedAt), lte(words.dueAt, now())))
        .get()?.c ?? 0
    )
  }

  /** Deterministic "word of the day": rotates through words not yet mastered. */
  wordOfDay(): Word | null {
    const list = this.repo.listWhere([], [asc(words.createdAt)])
    if (!list.length) return null
    const pool = list.filter((w) => w.stage !== 'mastered')
    const source = pool.length ? pool : list
    const day = Math.floor(now() / DAY_MS)
    return source[day % source.length]
  }

  stats(): EnglishStats {
    const list = this.db.select().from(words).where(isNull(words.deletedAt)).all()
    const byStage = Object.fromEntries(WORD_STAGES.map((s) => [s, 0])) as Record<WordStage, number>
    for (const w of list) byStage[stageOf(w)]++
    const today = startOfDay(now())
    const reviews = this.db
      .select({ at: wordReviews.reviewedAt })
      .from(wordReviews)
      .where(gte(wordReviews.reviewedAt, today - 400 * DAY_MS))
      .orderBy(desc(wordReviews.reviewedAt))
      .all()
    const days = new Set(reviews.map((r) => startOfDay(r.at)))
    let streak = 0
    let cursor = days.has(today) ? today : today - DAY_MS
    while (days.has(cursor)) {
      streak++
      cursor -= DAY_MS
    }
    return {
      total: list.length,
      due: list.filter((w) => w.dueAt <= now()).length,
      byStage,
      reviewedToday: reviews.filter((r) => r.at >= today).length,
      streakDays: streak
    }
  }

  api(): EnglishApi {
    const repo = this.repo
    return {
      list: async (query) => {
        const q = wordListQuerySchema.parse(query ?? {})
        const list = repo.listWhere([
          q.kind ? eq(words.kind, q.kind) : undefined,
          repo.hasTag(q.tagId),
          repo.matches(q.search, [words.term, words.translation, words.example, words.context])
        ])
        return q.stage ? list.filter((w) => w.stage === q.stage) : list
      },
      get: async (id) => repo.get(idArg.parse(id)),
      create: async (input) => {
        const [data, tagIds] = splitTags(wordInputSchema.parse(input))
        return repo.insert(
          { ...data, ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, dueAt: now(), lastReviewedAt: null },
          tagIds
        )
      },
      update: async (args) => {
        const { id, patch } = updateArgs(wordPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return repo.patch(id, data, tagIds)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      queue: async (limit) => {
        const n = z.number().int().min(1).max(500).optional().parse(limit) ?? 30
        return repo.listWhere([lte(words.dueAt, now())], [asc(words.dueAt)], n)
      },
      review: async (args) => {
        const { id, grade } = reviewInputSchema.parse(args)
        const row = repo.rowOrThrow(id)
        const at = now()
        const next = schedule(row, grade, at)
        this.db.insert(wordReviews).values({ id: newId(), wordId: id, grade, reviewedAt: at }).run()
        this.db.update(words).set(next).where(eq(words.id, id)).run()
        return repo.getOrThrow(id)
      },
      stats: async () => this.stats()
    }
  }
}
