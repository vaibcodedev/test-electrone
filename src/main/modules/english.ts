/** English vocabulary and grammar rules with spaced repetition (scheduler: core/srs, daily goal: english-session). */
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import type { EnglishApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import {
  ENGLISH_NEW_PER_DAY,
  ENGLISH_REVIEWS_PER_DAY,
  reviewInputSchema,
  WORD_STAGES,
  wordImportSchema,
  wordInputSchema,
  wordListQuerySchema,
  wordPatchSchema,
  type EnglishStats,
  type EnglishToday,
  type EntryKind,
  type Word,
  type WordStage
} from '@shared/domain/english'
import { termKey } from '@shared/english-import'
import { hasGaps } from '@shared/english-gaps'
import { z } from 'zod'
import { wordReviews, words } from '../db/schema'
import type { Orm } from '../db/client'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { addDays, dayKey, localDayNumber, newId, now, startOfDay } from '../core/util'
import { MASTERED_DAYS, REVIEW_DAYS, schedule, SRS_FIELDS, stageOf } from '../core/srs'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'
import { chartDays, pickSession, sessionLimits, streakOf, type DailyGoal } from './english-session'

type WordRow = typeof words.$inferSelect

/** Days of the statistics chart (a month; the week is its tail). */
const CHART_DAYS = 30

const DEFAULT_GOAL: DailyGoal = {
  newPerDay: ENGLISH_NEW_PER_DAY.default,
  reviewsPerDay: ENGLISH_REVIEWS_PER_DAY.default
}

/** SQL twin of `stageOf` (core/srs): the stage filter runs in the query, so pages stay correct. */
function stageWhere(stage: WordStage): SQL {
  const reviewed = isNotNull(words.lastReviewedAt)
  switch (stage) {
    case 'new':
      return isNull(words.lastReviewedAt)
    case 'mastered':
      return and(reviewed, gte(words.intervalDays, MASTERED_DAYS))!
    case 'review':
      return and(
        reviewed,
        gte(words.intervalDays, REVIEW_DAYS),
        lt(words.intervalDays, MASTERED_DAYS)
      )!
    case 'learning':
      return and(reviewed, lt(words.intervalDays, REVIEW_DAYS))!
  }
}

/**
 * A rule without a single gap (shared/english-gaps) has no card to show: it stays out of the trainer, the «Ще N
 * нових» count and is marked in the dictionary — all by `isTrainable`. The SQL part only narrows the rows down.
 */
const maybeTrainable = (): SQL => or(ne(words.kind, 'rule'), sql`${words.example} LIKE '%[%]%'`)!
const isTrainable = (w: { kind: string; example: string }): boolean =>
  w.kind !== 'rule' || hasGaps(w.example)

/** Same-millisecond inserts (an import) keep the file's order. */
const ADDED_ORDER = [asc(words.createdAt), asc(sql`rowid`)]

interface TodayState extends Omit<EnglishToday, 'newMore' | 'reviewsWaiting'> {
  /** Entries answered today: a forgotten one comes back without spending the cap again. */
  touched: Set<string>
  /** First answer of every entry ever studied. */
  firsts: number[]
}

export class EnglishModule {
  readonly descriptor: EntityDescriptor
  readonly repo: SoftRepository<WordRow, Word>

  /** `goal` reads the daily goal from the settings at every call (it changes while the app runs). */
  constructor(
    private readonly m: ModuleContext,
    private readonly goal: () => DailyGoal = () => DEFAULT_GOAL
  ) {
    this.descriptor = {
      type: 'word',
      table: words,
      searchDoc: (r) => ({
        title: r.term,
        body: `${r.translation}\n${r.example}\n${r.exampleTranslation}\n${r.context}\n${r.notes}`
      }),
      summary: (r) => ({
        title: r.term,
        subtitle:
          r.kind === 'rule'
            ? `Правило${r.translation ? ` · ${r.translation}` : ''}`
            : r.translation || undefined
      }),
      systemFields: SRS_FIELDS
    }
    this.repo = new SoftRepository(m.repo, this.descriptor, (r, tags) => ({
      ...r,
      kind: r.kind as EntryKind,
      stage: stageOf(r),
      tags
    }))
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  private todayState(): TodayState {
    const today = startOfDay(now())
    const rows = this.db
      .select({
        wordId: wordReviews.wordId,
        first: sql<number>`min(${wordReviews.reviewedAt})`,
        last: sql<number>`max(${wordReviews.reviewedAt})`
      })
      .from(wordReviews)
      // An entry in the trash no longer counts toward today (its answers come back with «Відновити»).
      .innerJoin(words, eq(words.id, wordReviews.wordId))
      .where(isNull(words.deletedAt))
      .groupBy(wordReviews.wordId)
      .all()
    const touched = new Set<string>()
    let newDone = 0
    let reviewsDone = 0
    for (const r of rows) {
      if (r.last < today) continue
      touched.add(r.wordId)
      if (r.first >= today) newDone++
      else reviewsDone++
    }
    const goal = this.goal()
    const limits = sessionLimits(goal, { newDone, reviewsDone })
    return {
      touched,
      firsts: rows.map((r) => r.first),
      newDone,
      newGoal: goal.newPerDay,
      reviewsDone,
      ...limits
    }
  }

  /** Up to `limit` trainable entries (all without it), in the given order. */
  private listTrainable(conditions: (SQL | undefined)[], order: SQL[], limit?: number): Word[] {
    if (limit === 0) return []
    const where = [...conditions, maybeTrainable()]
    if (limit === undefined) return this.repo.listWhere(where, order).filter(isTrainable)
    // Rules the SQL let through without a real gap are skipped: read on until `limit` is filled.
    const batch = Math.max(limit, 50)
    const out: Word[] = []
    for (let offset = 0; ; offset += batch) {
      const page = this.repo.listWhere(where, order, batch, offset)
      out.push(...page.filter(isTrainable))
      if (out.length >= limit || page.length < batch) return out.slice(0, limit)
    }
  }

  /**
   * Today's session: what the trainer shows and what «Тренуватися» counts. Entries answered today (forgotten, back
   * in 10 minutes) are read on their own: behind an older backlog and a reached cap they would never come back.
   * `waiting` — due reviews left over the daily cap.
   */
  private session(state = this.todayState()): { list: Word[]; waiting: boolean } {
    const due = [isNotNull(words.lastReviewedAt), lte(words.dueAt, now())]
    const touched = [...state.touched]
    const again = touched.length
      ? this.listTrainable([...due, inArray(words.id, touched)], [asc(words.dueAt)])
      : []
    const backlog = this.listTrainable(
      [...due, touched.length ? notInArray(words.id, touched) : undefined],
      [asc(words.dueAt)],
      state.reviewsLeft + 1
    )
    const fresh = this.listTrainable([isNull(words.lastReviewedAt)], ADDED_ORDER, state.newLeft)
    const reviews = [...again, ...backlog.slice(0, state.reviewsLeft)].sort(
      (x, y) => x.dueAt - y.dueAt
    )
    return {
      list: pickSession(reviews, fresh, state.touched, state),
      waiting: backlog.length > state.reviewsLeft
    }
  }

  /** New trainable entries not in today's session: what «Ще N нових» can still take. */
  private newMore(inSession: number): number {
    const plain =
      this.db
        .select({ c: count() })
        .from(words)
        .where(and(isNull(words.deletedAt), isNull(words.lastReviewedAt), ne(words.kind, 'rule')))
        .get()?.c ?? 0
    const rules = this.repo
      .listWhere([isNull(words.lastReviewedAt), eq(words.kind, 'rule')])
      .filter(isTrainable).length
    return Math.max(0, plain + rules - inSession)
  }

  dueCount(): number {
    return this.session().list.length
  }

  /** Deterministic "word of the day": rotates through words not yet mastered (rules aren't words). */
  wordOfDay(): Word | null {
    const list = this.repo.listWhere([ne(words.kind, 'rule')], [asc(words.createdAt)])
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
    const t = now()
    const today = startOfDay(t)
    const answers = this.db
      .select({ at: wordReviews.reviewedAt, grade: wordReviews.grade })
      .from(wordReviews)
      .where(gte(wordReviews.reviewedAt, addDays(today, -400)))
      .orderBy(desc(wordReviews.reviewedAt))
      .all()
    const state = this.todayState()
    const { newDone, newGoal, reviewsDone, reviewsLeft, newLeft } = state
    const chartFrom = addDays(today, -CHART_DAYS)
    const upcoming = list.map((w) => w.dueAt).filter((d) => d > t)
    const session = this.session(state)
    const freshInSession = session.list.filter((w) => !w.lastReviewedAt).length
    return {
      total: list.length,
      due: session.list.length,
      byStage,
      reviewedToday: answers.filter((r) => r.at >= today).length,
      streakDays: streakOf(new Set(answers.map((r) => dayKey(r.at))), t),
      nextDueAt: upcoming.length ? Math.min(...upcoming) : null,
      today: {
        newDone,
        newGoal,
        reviewsDone,
        reviewsLeft,
        newLeft,
        newMore: this.newMore(freshInSession),
        reviewsWaiting: session.waiting
      },
      days: chartDays(
        answers.filter((a) => a.at >= chartFrom),
        state.firsts.filter((f) => f >= chartFrom),
        t,
        CHART_DAYS
      )
    }
  }

  private insertNew(
    data: Omit<z.output<typeof wordInputSchema>, 'tagIds'>,
    tagIds?: string[]
  ): Word {
    return this.repo.insert(
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
        return this.insertNew(data, tagIds)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(wordPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return repo.patch(id, data, tagIds)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      queue: async (limit) => {
        const n = z.number().int().min(1).max(2000).optional().parse(limit)
        const list = this.session().list
        return n ? list.slice(0, n) : list
      },
      moreNew: async (limit) => {
        const n = z.number().int().min(1).max(500).optional().parse(limit) ?? 5
        return this.listTrainable([isNull(words.lastReviewedAt)], ADDED_ORDER, n)
      },
      practiceExtra: async (limit) => {
        const n = z.number().int().min(1).max(500).optional().parse(limit) ?? 10
        return this.listTrainable([gt(words.dueAt, now())], [asc(words.ease), asc(words.dueAt)], n)
      },
      review: async (args) => {
        const { id, grade, extra } = reviewInputSchema.parse(args)
        const row = repo.rowOrThrow(id)
        const at = now()
        this.db.insert(wordReviews).values({ id: newId(), wordId: id, grade, reviewedAt: at }).run()
        // Extra practice: remembering doesn't push the next review further; forgetting still counts as a lapse.
        if (extra && grade > 0)
          this.db.update(words).set({ lastReviewedAt: at }).where(eq(words.id, id)).run()
        else
          this.db
            .update(words)
            .set(schedule(row, grade, at))
            .where(eq(words.id, id))
            .run()
        return repo.getOrThrow(id)
      },
      stats: async () => this.stats(),
      importWords: async (input) => {
        const { rows, dryRun } = wordImportSchema.parse(input)
        const known = new Set(
          this.db
            .select({ term: words.term })
            .from(words)
            .where(isNull(words.deletedAt))
            .all()
            .map((r) => termKey(r.term))
        )
        const fresh: z.output<typeof wordInputSchema>[] = []
        let duplicates = 0
        let invalid = 0
        for (const r of rows) {
          const parsed = wordInputSchema.safeParse(r)
          if (!parsed.success) {
            invalid++
            continue
          }
          const key = termKey(parsed.data.term)
          if (known.has(key)) {
            duplicates++
            continue
          }
          known.add(key)
          fresh.push(parsed.data)
        }
        if (!dryRun && fresh.length)
          this.m.db.tx(() => {
            for (const w of fresh) this.insertNew(splitTags(w)[0])
          })
        return { added: fresh.length, duplicates, invalid }
      }
    }
  }
}
