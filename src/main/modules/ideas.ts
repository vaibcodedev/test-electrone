import { pageSchema } from '@shared/domain/common'
import { MAX } from '@shared/domain/limits'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { IdeasApi } from '@shared/api'
import {
  ideaInputSchema,
  ideaListQuerySchema,
  ideaPatchSchema,
  type Idea,
  type IdeaStatus
} from '@shared/domain/ideas'
import { boardColumns, ideas } from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { UserError } from '../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'
import type { BoardsModule } from './boards'

type IdeaRow = typeof ideas.$inferSelect

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  inbox: 'Вхідні',
  thinking: 'Обмірковую',
  planned: 'У планах',
  in_progress: 'У роботі',
  done: 'Зроблено',
  dropped: 'Відмовився'
}

export class IdeasModule {
  readonly repo: SoftRepository<IdeaRow, Idea>
  readonly descriptor: EntityDescriptor

  constructor(
    private readonly m: ModuleContext,
    private readonly boards: BoardsModule
  ) {
    this.descriptor = {
      type: 'idea',
      table: ideas,
      searchDoc: (r) => ({ title: r.title, body: r.body }),
      summary: (r) => ({ title: r.title, subtitle: IDEA_STATUS_LABEL[r.status as IdeaStatus] })
    }
    this.repo = new SoftRepository<IdeaRow, Idea>(m.repo, this.descriptor, (r, tags) => ({
      ...r,
      status: r.status as IdeaStatus,
      tags
    }))
  }

  api(): IdeasApi {
    return {
      list: async (query) => {
        const q = ideaListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return this.repo.listWhere(
          [
            q.status ? eq(ideas.status, q.status) : undefined,
            this.repo.hasTag(q.tagId),
            this.repo.matches(q.search, [ideas.title, ideas.body])
          ],
          [sql`${ideas.impact} DESC`, sql`${ideas.updatedAt} DESC`],
          page.limit,
          page.offset
        )
      },
      get: async (id) => this.repo.get(idArg.parse(id)),
      create: async (input) => {
        const [data, tagIds] = splitTags(ideaInputSchema.parse(input))
        return this.repo.insert({ ...data, boardId: null }, tagIds)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(ideaPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return this.repo.patch(id, data, tagIds)
      },
      remove: async (id) => this.repo.softDelete(idArg.parse(id)),
      convertToBoard: async (id) => {
        const idea = this.repo.getOrThrow(idArg.parse(id))
        if (idea.boardId && this.boards.boardRepo.row(idea.boardId)) {
          throw new UserError('У цієї ідеї вже є дошка')
        }
        return this.m.db.tx(() => {
          const board = this.boards.createBoard(
            {
              title: idea.title,
              description: idea.body,
              tagIds: idea.tags.map((t) => t.id)
            },
            { ideaId: idea.id }
          )
          const firstColumn = this.m.db.orm
            .select()
            .from(boardColumns)
            .where(and(eq(boardColumns.boardId, board.id)))
            .orderBy(asc(boardColumns.position))
            .get()
          if (firstColumn) {
            this.boards.createCard({
              boardId: board.id,
              columnId: firstColumn.id,
              title: `Розібрати ідею: ${idea.title}`.slice(0, MAX.title),
              description: idea.body
            })
          }
          this.repo.patch(idea.id, { boardId: board.id, status: 'in_progress' })
          this.m.links.create({
            fromType: 'idea',
            fromId: idea.id,
            toType: 'board',
            toId: board.id
          })
          return board
        })
      }
    }
  }
}
