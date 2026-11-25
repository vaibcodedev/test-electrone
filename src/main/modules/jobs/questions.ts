import { and, asc, desc, eq, isNull, lte, ne, notInArray, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { JobsApi } from '@shared/api'
import { chipCountsQuerySchema, pageSchema, type ChipCountsQuery } from '@shared/domain/common'
import {
  QUESTION_CATEGORIES,
  QUESTION_GROUPS,
  questionInputSchema,
  questionListQuerySchema,
  questionPatchSchema,
  questionReviewSchema,
  type QuestionCategory,
  type QuestionGroup
} from '@shared/domain/jobs'
import type { ReviewGrade } from '@shared/domain/english'
import { interviewQuestions } from '../../db/schema'
import type { Orm } from '../../db/client'
import { schedule } from '../../core/srs'
import { now } from '../../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from '../context'
import type { QuestionRepo } from './shared'

type QuestionsApi = Pick<
  JobsApi,
  | 'questions'
  | 'questionCounts'
  | 'question'
  | 'createQuestion'
  | 'updateQuestion'
  | 'removeQuestion'
  | 'topics'
  | 'practiceQueue'
  | 'reviewQuestion'
  | 'practiceExtra'
>

/** Category filter: one category, or a group (technical / everything else). */
function questionCategoryWhere(q: {
  category?: QuestionCategory
  group?: QuestionGroup
}): (SQL | undefined)[] {
  return [
    q.category ? eq(interviewQuestions.category, q.category) : undefined,
    q.group === 'technical'
      ? eq(interviewQuestions.category, 'technical')
      : q.group === 'nontechnical'
        ? ne(interviewQuestions.category, 'technical')
        : undefined
  ]
}

const practiceFilter = {
  category: z.enum(QUESTION_CATEGORIES).optional(),
  group: z.enum(QUESTION_GROUPS).optional()
}

/** The interview question bank, practised with spaced repetition (core/srs). */
export class Questions {
  constructor(
    private readonly m: ModuleContext,
    private readonly repo: QuestionRepo
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  due(): number {
    return (
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(interviewQuestions)
        .where(and(isNull(interviewQuestions.deletedAt), lte(interviewQuestions.dueAt, now())))
        .get()?.c ?? 0
    )
  }

  api(): QuestionsApi {
    const qs = this.repo
    // Search and tag shared by the list and its chip counters: the chips count what the list shows.
    const filters = (q: ChipCountsQuery): (SQL | undefined)[] => [
      qs.hasTag(q.tagId),
      qs.matches(q.search, [
        interviewQuestions.question,
        interviewQuestions.answer,
        interviewQuestions.topic
      ])
    ]
    return {
      questions: async (query) => {
        const q = questionListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return qs.listWhere(
          [
            ...questionCategoryWhere(q),
            q.topic ? eq(interviewQuestions.topic, q.topic) : undefined,
            q.companyId ? eq(interviewQuestions.companyId, q.companyId) : undefined,
            q.applicationId ? eq(interviewQuestions.applicationId, q.applicationId) : undefined,
            ...filters(q)
          ],
          [
            asc(interviewQuestions.category),
            asc(interviewQuestions.topic),
            desc(interviewQuestions.updatedAt)
          ],
          page.limit,
          page.offset
        )
      },
      questionCounts: async (query) =>
        qs.countBy(interviewQuestions.category, filters(chipCountsQuerySchema.parse(query ?? {}))),
      question: async (id) => qs.get(idArg.parse(id)),
      createQuestion: async (input) => {
        const [data, tagIds] = splitTags(questionInputSchema.parse(input))
        return qs.insert(
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
      updateQuestion: async (args) => {
        const { id, patch } = updateArgs(questionPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return qs.patch(id, data, tagIds)
      },
      removeQuestion: async (id) => qs.softDelete(idArg.parse(id)),
      topics: async () =>
        this.db
          .selectDistinct({ topic: interviewQuestions.topic })
          .from(interviewQuestions)
          .where(and(isNull(interviewQuestions.deletedAt), sql`${interviewQuestions.topic} != ''`))
          .all()
          .map((r) => r.topic)
          .sort((a, b) => a.localeCompare(b, 'uk')),
      practiceQueue: async (args) => {
        const q = z
          .object({ limit: z.number().int().min(1).max(200).optional(), ...practiceFilter })
          .parse(args ?? {})
        return qs.listWhere(
          [lte(interviewQuestions.dueAt, now()), ...questionCategoryWhere(q)],
          [asc(interviewQuestions.dueAt)],
          q.limit ?? 30
        )
      },
      reviewQuestion: async (args) => {
        const { id, grade, extra } = questionReviewSchema.parse(args)
        const row = qs.rowOrThrow(id)
        const next = schedule(row, grade as ReviewGrade, now())
        // Extra practice must not distort the schedule: it can only bring a question back sooner (a lapse),
        // a good answer ahead of time doesn't push the next review further.
        const values = extra && next.dueAt >= row.dueAt ? { lastReviewedAt: now() } : next
        this.db.update(interviewQuestions).set(values).where(eq(interviewQuestions.id, id)).run()
        return qs.getOrThrow(id)
      },
      practiceExtra: async (args) => {
        const q = z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            ...practiceFilter,
            topic: z.string().max(100).optional(),
            excludeIds: z.array(idArg).max(1000).optional()
          })
          .parse(args ?? {})
        return qs.listWhere(
          [
            ...questionCategoryWhere(q),
            q.topic ? eq(interviewQuestions.topic, q.topic) : undefined,
            q.excludeIds?.length ? notInArray(interviewQuestions.id, q.excludeIds) : undefined
          ],
          [asc(interviewQuestions.dueAt), asc(interviewQuestions.ease)],
          q.limit ?? 10
        )
      }
    }
  }
}
