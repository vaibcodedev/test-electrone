/** English vocabulary from work with spaced repetition (scheduler: core/srs). */
import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lt, lte, sql, type SQL } from 'drizzle-orm'
import type { EnglishApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import {
  reviewInputSchema,
  WORD_STAGES,
  wordInputSchema,
  wordListQuerySchema,
  wordPatchSchema,
  type EnglishStats,
  type Word,
  type WordKind,
  type WordStage
} from '@shared/domain/english'
import { z } from 'zod'
import { wordReviews, words } from '../db/schema'
import type { Orm } from '../db/client'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { addDays, localDayNumber, newId, now, startOfDay } from '../core/util'
import { MASTERED_DAYS, REVIEW_DAYS, schedule, SRS_FIELDS, stageOf } from '../core/srs'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'

type WordRow = typeof words.$inferSelect

/** SQL twin of `stageOf` (core/srs): the stage filter runs in the query, so pages stay correct. */
function stageWhere(stage: WordStage): SQL {
  const reviewed = isNotNull(words.lastReviewedAt)
  switch (stage) {
    case 'new':
      return isNull(words.lastReviewedAt)
    case 'mastered':
      return and(reviewed, gte(words.intervalDays, MASTERED_DAYS))!
    case 'review':
      return and(reviewed, gte(words.intervalDays, REVIEW_DAYS), lt(words.intervalDays, MASTERED_DAYS))!
    case 'learning':
      return and(reviewed, lt(words.intervalDays, REVIEW_DAYS))!
  }
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
      summary: (r) => ({ title: r.term, subtitle: r.translation || undefined }),
      systemFields: SRS_FIELDS
    }
    this.repo = new SoftRepository(m.repo, this.descriptor, (r, tags) => ({
      ...r,
      kind: r.kind as WordKind,
      stage: stageOf(r),
      tags
    }))
  }

  private get db(): Orm {
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
    // Local day number: the word changes at local midnight, not at 00:00 UTC.
    const day = localDayNumber(now())
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
      .where(gte(wordReviews.reviewedAt, addDays(today, -400)))
      .orderBy(desc(wordReviews.reviewedAt))
      .all()
    const days = new Set(reviews.map((r) => startOfDay(r.at)))
    let streak = 0
    let cursor = days.has(today) ? today : addDays(today, -1)
    while (days.has(cursor)) {
      streak++
      cursor = addDays(cursor, -1)
    }
    const t = now()
    const upcoming = list.map((w) => w.dueAt).filter((d) => d > t)
    return {
      total: list.length,
      due: list.length - upcoming.length,
      byStage,
      reviewedToday: reviews.filter((r) => r.at >= today).length,
      streakDays: streak,
      nextDueAt: upcoming.length ? Math.min(...upcoming) : null
    }
  }

  api(): EnglishApi {
    const repo = this.repo
    return {
      list: async (query) => {
        const q = wordListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return repo.listFavoritesFirst(
          [
            q.kind ? eq(words.kind, q.kind) : undefined,
            q.stage ? stageWhere(q.stage) : undefined,
            repo.hasTag(q.tagId),
            repo.onlyFavorites(q.favorite),
            repo.matches(q.search, [words.term, words.translation, words.example, words.context])
          ],
          undefined,
          page.limit,
          page.offset
        )
      },
      get: async (id) => repo.get(idArg.parse(id)),
      create: async (input) => {
        const [data, tagIds] = splitTags(wordInputSchema.parse(input))
        return repo.insert(
          {
            ...data,
            ease: 2.5,
            intervalDays: 0,
            repetitions: 0,
            lapses: 0,
            dueAt: now(),
            lastReviewedAt: null
          },
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
      practiceExtra: async (limit) => {
        const n = z.number().int().min(1).max(500).optional().parse(limit) ?? 10
        return repo.listWhere([gt(words.dueAt, now())], [asc(words.ease), asc(words.dueAt)], n)
      },
      review: async (args) => {
        const { id, grade, extra } = reviewInputSchema.parse(args)
        const row = repo.rowOrThrow(id)
        const at = now()
        this.db.insert(wordReviews).values({ id: newId(), wordId: id, grade, reviewedAt: at }).run()
        // Extra practice: remembering doesn't push the next review further; forgetting still counts as a lapse.
        if (extra && grade > 0) this.db.update(words).set({ lastReviewedAt: at }).where(eq(words.id, id)).run()
        else this.db.update(words).set(schedule(row, grade, at)).where(eq(words.id, id)).run()
        return repo.getOrThrow(id)
      },
      stats: async () => this.stats()
    }
  }
}
