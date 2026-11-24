import { asc, eq, isNull } from 'drizzle-orm'
import type { Api } from '@shared/api'
import type { EntitySummary } from '@shared/domain/common'
import { quickAddSchema, type QuickAddInput } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { boardColumns, boards } from '../db/schema'
import { DAY_MS, now, startOfDay, UserError } from '../core/util'

/**
 * Turns one line from the global quick-add window into an entity of the chosen module.
 * Depends only on the public Api (Dependency Inversion) — not on module internals.
 */
export class QuickAddService {
  constructor(
    private readonly api: Pick<Api, 'ideas' | 'cards' | 'claude' | 'snippets' | 'bookmarks' | 'english' | 'events'>,
    private readonly ctx: DbContext
  ) {}

  /** Inbox for quick tasks: the first column of the most recently updated board. */
  private inboxColumn(): { boardId: string; columnId: string } {
    const board = this.ctx.orm
      .select({ id: boards.id })
      .from(boards)
      .where(isNull(boards.deletedAt))
      .orderBy(asc(boards.archived), asc(boards.createdAt))
      .get()
    if (!board) throw new UserError('Сначала создайте хотя бы одну доску')
    const col = this.ctx.orm
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(eq(boardColumns.boardId, board.id))
      .orderBy(asc(boardColumns.position))
      .get()
    if (!col) throw new UserError('На доске нет колонок')
    return { boardId: board.id, columnId: col.id }
  }

  async add(input: QuickAddInput): Promise<EntitySummary> {
    const { target, text, extra } = quickAddSchema.parse(input)
    const title = text.split('\n')[0].slice(0, 300)
    const rest = [text.split('\n').slice(1).join('\n'), extra].filter(Boolean).join('\n').trim()
    switch (target) {
      case 'idea': {
        const e = await this.api.ideas.create({ title, body: rest })
        return { type: 'idea', id: e.id, title: e.title }
      }
      case 'card': {
        const where = this.inboxColumn()
        const e = await this.api.cards.create({ ...where, title, description: rest })
        return { type: 'card', id: e.id, title: e.title }
      }
      case 'claude': {
        const e = await this.api.claude.create({ kind: 'note', title, content: rest })
        return { type: 'claude', id: e.id, title: e.title }
      }
      case 'snippet': {
        const e = await this.api.snippets.create({ title, code: rest })
        return { type: 'snippet', id: e.id, title: e.title }
      }
      case 'bookmark': {
        const isUrl = /^https?:\/\//i.test(title)
        const url = isUrl ? title : rest.match(/https?:\/\/\S+/)?.[0] ?? ''
        const e = await this.api.bookmarks.create({ title: isUrl ? (rest || title) : title, url })
        return { type: 'bookmark', id: e.id, title: e.title }
      }
      case 'word': {
        // "term — translation" or "term = translation" on one line also works.
        const [term, translation] = title.split(/\s+[—=-]\s+/)
        const e = await this.api.english.create({ term: term.trim(), translation: (translation ?? rest).trim() })
        return { type: 'word', id: e.id, title: e.term }
      }
      case 'event': {
        const start = startOfDay(now()) + DAY_MS + 10 * 3600_000
        const e = await this.api.events.create({ title, description: rest, startAt: start })
        return { type: 'event', id: e.id, title: e.title }
      }
    }
  }
}
