import { asc, desc, eq, isNull } from 'drizzle-orm'
import { fieldMax, MAX } from '@shared/domain/limits'
import { bookmarkInputSchema } from '@shared/domain/bookmarks'
import { eventInputSchema } from '@shared/domain/calendar'
import type { Api } from '@shared/api'
import type { EntitySummary } from '@shared/domain/common'
import { quickAddSchema, type QuickAddInput } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { boardColumns, boards } from '../db/schema'
import { addDays, now, startOfDay, UserError } from '../core/util'

// Text + «extra» may be longer than a bookmark's notes or an event's description: the tail is clipped, not refused.
const BOOKMARK_NOTES_MAX = fieldMax(bookmarkInputSchema.shape.notes)
const EVENT_DESCRIPTION_MAX = fieldMax(eventInputSchema.shape.description)

/**
 * Turns one line from the global quick-add window into an entity of the chosen module.
 * Depends only on the public Api (Dependency Inversion) — not on module internals.
 */
export class QuickAddService {
  constructor(
    private readonly api: Pick<Api, 'ideas' | 'cards' | 'claude' | 'snippets' | 'bookmarks' | 'english' | 'events'>,
    private readonly ctx: DbContext
  ) {}

  /** Inbox for quick tasks: the first column of the most recently updated board (archived ones last). */
  private inboxColumn(): { boardId: string; columnId: string } {
    const board = this.ctx.orm
      .select({ id: boards.id })
      .from(boards)
      .where(isNull(boards.deletedAt))
      .orderBy(asc(boards.archived), desc(boards.updatedAt))
      .get()
    if (!board) throw new UserError('Спершу створіть хоча б одну дошку')
    const col = this.ctx.orm
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(eq(boardColumns.boardId, board.id))
      .orderBy(asc(boardColumns.position))
      .get()
    if (!col) throw new UserError('На дошці немає колонок')
    return { boardId: board.id, columnId: col.id }
  }

  async add(input: QuickAddInput): Promise<EntitySummary> {
    const { target, text, extra } = quickAddSchema.parse(input)
    const title = text.split('\n')[0].slice(0, MAX.title)
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
        // A pasted link on the first line: the title is the first line of what follows (a long multi-line
        // text used to become the title and fail the save); the text itself goes to notes.
        const name = isUrl ? (rest.split('\n')[0].trim() || title).slice(0, MAX.title) : title
        const e = await this.api.bookmarks.create({
          title: name,
          url,
          notes: isUrl ? rest.slice(0, BOOKMARK_NOTES_MAX) : ''
        })
        return { type: 'bookmark', id: e.id, title: e.title }
      }
      case 'word': {
        // "term — translation" or "term = translation" on one line also works.
        const [term, translation] = title.split(/\s+[—=-]\s+/)
        const e = await this.api.english.create({
          term: term.trim().slice(0, 300),
          translation: (translation ?? rest).trim().slice(0, 1000)
        })
        return { type: 'word', id: e.id, title: e.term }
      }
      case 'event': {
        // Tomorrow 10:00 local — calendar days, not +24h (a DST night would shift it by an hour).
        const tomorrow = new Date(addDays(startOfDay(now()), 1))
        tomorrow.setHours(10, 0, 0, 0)
        const start = tomorrow.getTime()
        const e = await this.api.events.create({
          title,
          description: rest.slice(0, EVENT_DESCRIPTION_MAX),
          startAt: start
        })
        return { type: 'event', id: e.id, title: e.title }
      }
    }
  }
}
