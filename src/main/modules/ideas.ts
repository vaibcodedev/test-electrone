import { chipCountsQuerySchema, pageSchema, type ChipCountsQuery } from '@shared/domain/common'
import { fieldMax, MAX } from '@shared/domain/limits'
import { boardInputSchema, cardInputSchema } from '@shared/domain/boards'
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import type { IdeasApi } from '@shared/api'
import {
  IDEA_STATUS_LABEL,
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

const BOARD_DESCRIPTION_MAX = fieldMax(boardInputSchema.shape.description)
// An idea written before the limits were tightened may be longer than a card takes: the card gets the start.
const CARD_DESCRIPTION_MAX = fieldMax(cardInputSchema.shape.description)

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
    // Search and tag shared by the list and its chip counters: the chips count what the list shows.
    const filters = (q: ChipCountsQuery): (SQL | undefined)[] => [
      this.repo.hasTag(q.tagId),
      this.repo.onlyFavorites(q.favorite),
      this.repo.matches(q.search, [ideas.title, ideas.body])
    ]
    return {
      counts: async (query) =>
        this.repo.countBy(ideas.status, filters(chipCountsQuerySchema.parse(query ?? {}))),
      list: async (query) => {
        const q = ideaListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return this.repo.listFavoritesFirst(
          [q.status ? eq(ideas.status, q.status) : undefined, ...filters(q)],
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
              // A board description holds less than an idea body: the full text stays in the «Розібрати ідею» card.
              description: idea.body.slice(0, BOARD_DESCRIPTION_MAX),
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
              description: idea.body.slice(0, CARD_DESCRIPTION_MAX)
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
