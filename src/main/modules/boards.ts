import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { BoardsApi, CardsApi } from '@shared/api'
import {
  boardInputSchema,
  boardListSchema,
  boardPatchSchema,
  cardCheckInputSchema,
  cardInputSchema,
  cardMoveSchema,
  cardPatchSchema,
  columnInputSchema,
  columnPatchSchema,
  type Board,
  type BoardColumn,
  type BoardSummary,
  type Card,
  type CardRepeatOutcome,
  type ChecklistEntry,
  type DueCard
} from '@shared/domain/boards'
import { z } from 'zod'
import { fieldMax } from '@shared/domain/limits'
import type { CalendarItem } from '@shared/domain/calendar'
import { boardColumns, boards, cardChecklist, cards } from '../db/schema'
import type { Orm } from '../db/client'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { excerpt, newId, now, NotFoundError, startOfDay, UserError } from '../core/util'
import { nextPosition, reorder } from '../core/ordering'
import { idArg, orderedIds, splitTags, updateArgs, type ModuleContext } from './context'
import { nextRepeatDue, normalizeRepeat, parseRepeat, repeatAfterEdit } from './card-repeat'

type BoardRow = typeof boards.$inferSelect
type CardRow = typeof cards.$inferSelect

export const DEFAULT_COLUMNS: { title: string; isDone?: boolean }[] = [
  { title: 'Беклог' },
  { title: 'У роботі' },
  { title: 'Рев’ю' },
  { title: 'Готово', isDone: true }
]

const PRIORITY_LABEL: Record<string, string> = {
  none: '',
  low: 'низький',
  medium: 'середній',
  high: 'високий',
  urgent: 'терміново'
}

/** A card counts only while its board isn't in the trash (cards keep deletedAt = null when the board goes). */
export const CARD_ON_LIVE_BOARD = sql`${cards.boardId} IN (SELECT ${boards.id} FROM ${boards} WHERE ${boards.deletedAt} IS NULL)`

export class BoardsModule {
  readonly boardRepo: SoftRepository<BoardRow, Board>
  readonly cardRepo: SoftRepository<CardRow, Card>
  readonly descriptors: EntityDescriptor[]

  constructor(private readonly m: ModuleContext) {
    const boardDescriptor: EntityDescriptor = {
      type: 'board',
      table: boards,
      searchDoc: (r) => ({ title: r.title, body: r.description }),
      summary: (r) => ({ title: r.title, subtitle: excerpt(r.description) }),
      textField: { column: 'description', max: fieldMax(boardInputSchema.shape.description) },
      dependents: (id) =>
        m.db.orm
          .select({ id: cards.id })
          .from(cards)
          .where(eq(cards.boardId, id))
          .all()
          .map((c) => ({ type: 'card' as const, id: c.id })),
      exportBody: (r) => this.exportBody(r.id)
    }
    const cardDescriptor: EntityDescriptor = {
      type: 'card',
      table: cards,
      searchDoc: (r) => ({ title: r.title, body: r.description }),
      summary: (r) => ({ title: r.title, subtitle: PRIORITY_LABEL[r.priority] || undefined }),
      textField: { column: 'description', max: fieldMax(cardInputSchema.shape.description) },
      // Cards of a board in the trash stay deletedAt = null; this hides them from feeds, pins, links, search.
      aliveWhere: CARD_ON_LIVE_BOARD,
      parentHint: 'Спершу відновіть дошку, до якої належить ця картка',
      onRestore: (r) => this.reattachCard(r as CardRow),
      // «Скасувати» after a move into «Готово» brings the card back, but the next card of its series stays made:
      // keeping the mark means moving it into «Готово» again creates no second one.
      systemFields: ['repeatNextId']
    }
    this.descriptors = [boardDescriptor, cardDescriptor]
    this.boardRepo = new SoftRepository<BoardRow, Board>(m.repo, boardDescriptor, (r, tags) => ({
      ...r,
      tags
    }))
    this.cardRepo = new SoftRepository<CardRow, Card>(m.repo, cardDescriptor, (r, tags) => ({
      ...r,
      priority: r.priority as Card['priority'],
      repeat: parseRepeat(r.repeat),
      tags,
      checklistTotal: 0,
      checklistDone: 0
    }))
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  /* ───────── boards ───────── */

  createBoard(input: z.input<typeof boardInputSchema>, extra: { ideaId?: string } = {}): Board {
    const [data, tagIds] = splitTags(boardInputSchema.parse(input))
    return this.m.db.tx(() => {
      const board = this.boardRepo.insert(
        { ...data, ideaId: extra.ideaId ?? null, archived: false },
        tagIds
      )
      DEFAULT_COLUMNS.forEach((c, i) => {
        this.db
          .insert(boardColumns)
          .values({
            id: newId(),
            boardId: board.id,
            title: c.title,
            isDone: !!c.isDone,
            position: i,
            color: null
          })
          .run()
      })
      return board
    })
  }

  listBoards(
    opts: { ids?: string[]; projectId?: string; limit?: number; offset?: number } = {}
  ): BoardSummary[] {
    const list = this.boardRepo.listWhere(
      [
        opts.ids ? inArray(boards.id, opts.ids) : undefined,
        // A CRM project's boards («Дошка» on the project page): boards.projectId, set when the board is made there.
        opts.projectId ? eq(boards.projectId, opts.projectId) : undefined
      ],
      [sql`${boards.archived} ASC`, this.boardRepo.favoritesFirst(), sql`${boards.updatedAt} DESC`],
      opts.limit,
      opts.offset
    )
    if (!list.length) return []
    const todayStart = startOfDay(now())
    const stats = this.db
      .select({
        boardId: cards.boardId,
        total: sql<number>`count(*)`,
        done: sql<number>`sum(CASE WHEN ${boardColumns.isDone} THEN 1 ELSE 0 END)`,
        overdue: sql<number>`sum(CASE WHEN NOT ${boardColumns.isDone} AND ${cards.dueAt} IS NOT NULL AND ${cards.dueAt} < ${todayStart} THEN 1 ELSE 0 END)`
      })
      .from(cards)
      .innerJoin(boardColumns, eq(boardColumns.id, cards.columnId))
      .where(
        and(
          isNull(cards.deletedAt),
          inArray(
            cards.boardId,
            list.map((b) => b.id)
          )
        )
      )
      .groupBy(cards.boardId)
      .all()
    const byBoard = new Map(stats.map((s) => [s.boardId, s]))
    return list.map((b) => {
      const s = byBoard.get(b.id)
      return {
        ...b,
        cardCount: s?.total ?? 0,
        doneCount: s?.done ?? 0,
        overdueCount: s?.overdue ?? 0
      }
    })
  }

  columns(boardId: string): BoardColumn[] {
    return this.db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, boardId))
      .orderBy(asc(boardColumns.position))
      .all()
  }

  /** Cards with checklist counters. */
  cardsWhere(...conditions: Parameters<typeof and>): Card[] {
    const rows = this.db
      .select()
      .from(cards)
      .where(and(isNull(cards.deletedAt), ...conditions))
      .orderBy(asc(cards.position))
      .all()
    const hydrated = this.cardRepo.hydrate(rows)
    if (!hydrated.length) return hydrated
    const counts = this.db
      .select({
        cardId: cardChecklist.cardId,
        total: sql<number>`count(*)`,
        done: sql<number>`sum(${cardChecklist.done})`
      })
      .from(cardChecklist)
      .where(
        inArray(
          cardChecklist.cardId,
          hydrated.map((c) => c.id)
        )
      )
      .groupBy(cardChecklist.cardId)
      .all()
    const byCard = new Map(counts.map((c) => [c.cardId, c]))
    return hydrated.map((c) => ({
      ...c,
      checklistTotal: byCard.get(c.id)?.total ?? 0,
      checklistDone: byCard.get(c.id)?.done ?? 0
    }))
  }

  /**
   * A restored card whose column was deleted meanwhile («Видалити колонку разом з картками») would be
   * invisible on its board: it goes to the end of the board's first column instead.
   */
  private reattachCard(card: CardRow): void {
    if (
      this.db
        .select({ id: boardColumns.id })
        .from(boardColumns)
        .where(eq(boardColumns.id, card.columnId))
        .get()
    )
      return
    const first = this.columns(card.boardId)[0]
    if (!first)
      throw new UserError('На дошці немає колонок — додайте колонку й відновіть картку ще раз')
    this.db
      .update(cards)
      .set({
        columnId: first.id,
        position: this.nextCardPosition(first.id),
        completedAt: first.isDone ? (card.completedAt ?? now()) : null
      })
      .where(eq(cards.id, card.id))
      .run()
  }

  private nextCardPosition(columnId: string): number {
    return nextPosition(this.m.db, cards.position, eq(cards.columnId, columnId), 1024)
  }

  private column(id: string): BoardColumn {
    const col = this.db.select().from(boardColumns).where(eq(boardColumns.id, id)).get()
    if (!col) throw new NotFoundError('Колонка', id)
    return col
  }

  /** The board a column belongs to; a board in the trash takes no new cards from outside. */
  boardIdOfColumn(columnId: string): string {
    return this.boardRepo.rowOrThrow(this.column(columnId).boardId).id
  }

  /** Markdown export: the board's columns with their cards as a task list. */
  private exportBody(boardId: string): string[] {
    const list = this.db
      .select({ title: cards.title, columnId: cards.columnId })
      .from(cards)
      .where(and(eq(cards.boardId, boardId), isNull(cards.deletedAt)))
      .orderBy(asc(cards.position))
      .all()
    return this.columns(boardId).flatMap((col) => [
      `## ${col.title}`,
      '',
      ...list
        .filter((c) => c.columnId === col.id)
        .map((c) => `- [${col.isDone ? 'x' : ' '}] ${c.title}`),
      ''
    ])
  }

  /* ───────── cards ───────── */

  createCard(input: z.input<typeof cardInputSchema>): Card {
    const [data, tagIds] = splitTags(cardInputSchema.parse(input))
    const col = this.column(data.columnId)
    // Created right in «Готово» it is simply done: the next card comes only from a move into «Готово».
    const card = this.cardRepo.insert(
      {
        ...data,
        repeat: normalizeRepeat(data.repeat, data.dueAt, now()),
        repeatNextId: null,
        boardId: col.boardId,
        position: this.nextCardPosition(data.columnId),
        completedAt: col.isDone ? now() : null
      },
      tagIds
    )
    this.boardRepo.touch(col.boardId)
    return card
  }

  /**
   * The next card of a repeating series, when `card` has just been moved by the person from a column that isn't
   * «Готово» into one that is. Once per card (repeatNextId): back and into «Готово» again makes no second one, even
   * if the first was changed or deleted since. Goes to the end of the board's first column that isn't «Готово»;
   * `skipColumn` is the one being deleted. Runs inside the caller's transaction.
   */
  private spawnNext(
    card: CardRow,
    boardId: string,
    out: CardRepeatOutcome,
    skipColumn?: string
  ): void {
    const rule = parseRepeat(card.repeat)
    if (!rule || card.repeatNextId) return
    const target = this.columns(boardId).find((c) => !c.isDone && c.id !== skipColumn)
    if (!target) {
      // Said in a toast; the card keeps no mark, so the series goes on once a column like that exists.
      ;(out.blocked ??= []).push(card.title)
      return
    }
    const dueAt = nextRepeatDue(rule, card.dueAt, now())
    const tagIds = (this.m.repo.tags.forMany('card', [card.id]).get(card.id) ?? []).map((t) => t.id)
    const next = this.cardRepo.insert(
      {
        boardId,
        columnId: target.id,
        title: card.title,
        description: card.description,
        priority: card.priority,
        dueAt,
        repeat: rule,
        repeatNextId: null,
        position: this.nextCardPosition(target.id),
        completedAt: null
      },
      tagIds
    )
    for (const entry of this.checklist(card.id)) {
      this.db
        .insert(cardChecklist)
        .values({
          id: newId(),
          cardId: next.id,
          text: entry.text,
          done: false,
          position: entry.position
        })
        .run()
    }
    this.db.update(cards).set({ repeatNextId: next.id }).where(eq(cards.id, card.id)).run()
    ;(out.spawned ??= []).push({ id: next.id, title: next.title, dueAt })
  }

  moveCard(input: z.input<typeof cardMoveSchema>): CardRepeatOutcome {
    const { cardId, columnId, index } = cardMoveSchema.parse(input)
    const out: CardRepeatOutcome = {}
    this.m.db.tx(() => {
      const card = this.cardRepo.rowOrThrow(cardId)
      const target = this.column(columnId)
      const from = this.db
        .select({ isDone: boardColumns.isDone })
        .from(boardColumns)
        .where(eq(boardColumns.id, card.columnId))
        .get()
      const siblings = this.db
        .select({ id: cards.id })
        .from(cards)
        .where(
          and(eq(cards.columnId, columnId), isNull(cards.deletedAt), sql`${cards.id} != ${cardId}`)
        )
        .orderBy(asc(cards.position))
        .all()
        .map((r) => r.id)
      siblings.splice(Math.min(index, siblings.length), 0, cardId)
      siblings.forEach((id, i) => {
        this.db
          .update(cards)
          .set({ position: (i + 1) * 1024 })
          .where(eq(cards.id, id))
          .run()
      })
      const movedColumn = card.columnId !== columnId
      this.db
        .update(cards)
        .set({
          columnId,
          boardId: target.boardId,
          updatedAt: now(),
          // Between two «Готово» columns the card stays closed when it was: not «done this week» again.
          ...(movedColumn
            ? { completedAt: target.isDone ? (card.completedAt ?? now()) : null }
            : {})
        })
        .where(eq(cards.id, cardId))
        .run()
      if (movedColumn && target.isDone && !from?.isDone) this.spawnNext(card, target.boardId, out)
      this.boardRepo.touch(target.boardId)
    })
    return out
  }

  checklist(cardId: string): ChecklistEntry[] {
    return this.db
      .select()
      .from(cardChecklist)
      .where(eq(cardChecklist.cardId, cardId))
      .orderBy(asc(cardChecklist.position))
      .all()
  }

  due(range: { from: number; to: number; boardId?: string }): DueCard[] {
    const rows = this.db
      .select({
        card: cards,
        boardTitle: boards.title,
        columnTitle: boardColumns.title,
        columnIsDone: boardColumns.isDone
      })
      .from(cards)
      .innerJoin(boards, eq(boards.id, cards.boardId))
      .innerJoin(boardColumns, eq(boardColumns.id, cards.columnId))
      .where(
        and(
          isNull(cards.deletedAt),
          isNull(boards.deletedAt),
          gte(cards.dueAt, range.from),
          lte(cards.dueAt, range.to),
          range.boardId ? eq(cards.boardId, range.boardId) : undefined
        )
      )
      .orderBy(asc(cards.dueAt))
      .all()
    const hydrated = this.cardsWhere(
      inArray(
        cards.id,
        rows.map((r) => r.card.id)
      )
    )
    const byId = new Map(hydrated.map((c) => [c.id, c]))
    return rows.flatMap((r) => {
      const c = byId.get(r.card.id)
      return c
        ? [
            {
              ...c,
              boardTitle: r.boardTitle,
              columnTitle: r.columnTitle,
              columnIsDone: r.columnIsDone
            }
          ]
        : []
    })
  }

  /** Calendar feed: card deadlines (a card due at 00:00 is an all-day item). */
  calendarFeed(from: number, to: number): CalendarItem[] {
    return this.due({ from, to }).map((c) => ({
      key: `card:${c.id}`,
      source: 'card' as const,
      ref: { type: 'card' as const, id: c.id },
      title: c.title,
      startAt: c.dueAt!,
      endAt: null,
      allDay: new Date(c.dueAt!).getHours() === 0 && new Date(c.dueAt!).getMinutes() === 0,
      color: null,
      done: c.columnIsDone
    }))
  }

  /* ───────── API ───────── */

  boardsApi(): BoardsApi {
    return {
      list: async (query) => this.listBoards(boardListSchema.parse(query ?? {})),
      get: async (id) => this.listBoards({ ids: [idArg.parse(id)] })[0] ?? null,
      create: async (input) => {
        const board = this.createBoard(input)
        return { ...board, cardCount: 0, doneCount: 0, overdueCount: 0 }
      },
      update: async (args) => {
        const { id, patch } = updateArgs(boardPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        this.boardRepo.patch(id, data, tagIds)
        return this.listBoards({ ids: [id] })[0]!
      },
      remove: async (id) => this.boardRepo.softDelete(idArg.parse(id)),
      details: async (id) => {
        const board = this.boardRepo.get(idArg.parse(id))
        if (!board) return null
        return {
          board,
          columns: this.columns(board.id),
          cards: this.cardsWhere(eq(cards.boardId, board.id))
        }
      },
      addColumn: async (args) => {
        const { boardId, input } = z
          .object({ boardId: idArg, input: columnInputSchema })
          .parse(args)
        this.boardRepo.rowOrThrow(boardId)
        const position = nextPosition(
          this.m.db,
          boardColumns.position,
          eq(boardColumns.boardId, boardId)
        )
        const col = { id: newId(), boardId, ...input, position }
        this.db.insert(boardColumns).values(col).run()
        this.boardRepo.touch(boardId)
        return col
      },
      updateColumn: async (args) => {
        const { id, patch } = updateArgs(columnPatchSchema).parse(args)
        const before = this.column(id)
        const col = this.db
          .update(boardColumns)
          .set(patch)
          .where(eq(boardColumns.id, id))
          .returning()
          .get()!
        // Only a real flip re-stamps the cards; long-done cards keep their date (weekly review counts by it).
        if (patch.isDone !== undefined && patch.isDone !== before.isDone) {
          this.db
            .update(cards)
            .set({
              completedAt: patch.isDone ? sql`coalesce(${cards.completedAt}, ${now()})` : null
            })
            .where(eq(cards.columnId, id))
            .run()
        }
        return col
      },
      removeColumn: async (args) => {
        const { id, moveCardsTo } = z
          .object({ id: idArg, moveCardsTo: idArg.nullable() })
          .parse(args)
        const col = this.column(id)
        const target = moveCardsTo ? this.column(moveCardsTo) : null
        if (target && (target.id === id || target.boardId !== col.boardId)) {
          throw new UserError('Картки можна перенести лише в іншу колонку цієї дошки')
        }
        const out: CardRepeatOutcome = {}
        this.m.db.tx(() => {
          const moved = this.db
            .select()
            .from(cards)
            .where(and(eq(cards.columnId, id), isNull(cards.deletedAt)))
            .orderBy(asc(cards.position))
            .all()
          if (target) {
            this.db
              .update(cards)
              .set({
                columnId: target.id,
                completedAt: target.isDone ? sql`coalesce(${cards.completedAt}, ${now()})` : null
              })
              .where(eq(cards.columnId, id))
              .run()
            // «Перенести й видалити» into «Готово» closes the cards like a move does: repeating ones get their next.
            if (target.isDone && !col.isDone) {
              for (const card of moved) this.spawnNext(card, col.boardId, out, id)
            }
          } else {
            for (const c of moved) this.cardRepo.softDelete(c.id)
          }
          this.db.delete(boardColumns).where(eq(boardColumns.id, id)).run()
        })
        this.boardRepo.touch(col.boardId)
        return out
      },
      reorderColumns: async (args) => {
        const { boardId, ids } = z.object({ boardId: idArg, ids: orderedIds }).parse(args)
        reorder(this.m.db, boardColumns, boardColumns.id, ids, eq(boardColumns.boardId, boardId))
      }
    }
  }

  cardsApi(): CardsApi {
    const getDetails: CardsApi['get'] = async (id) => {
      const [card] = this.cardsWhere(eq(cards.id, idArg.parse(id)))
      if (!card) return null
      const board = this.boardRepo.row(card.boardId, true)
      const col = this.db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.id, card.columnId))
        .get()
      return {
        ...card,
        checklist: this.checklist(card.id),
        boardTitle: board?.title ?? '',
        columnTitle: col?.title ?? ''
      }
    }
    return {
      get: getDetails,
      create: async (input) => this.createCard(input),
      update: async (args) => {
        const { id, patch } = updateArgs(cardPatchSchema).parse(args)
        const [{ columnId, ...data }, tagIds] = splitTags(patch)
        // Fields first, then the column: a deadline or rule changed in the same patch goes into the next card.
        const [card, repeatOutcome] = this.m.db.tx(() => {
          const current = this.cardRepo.rowOrThrow(id)
          if (data.repeat !== undefined || data.dueAt !== undefined) {
            data.repeat = repeatAfterEdit(
              { repeat: parseRepeat(current.repeat), dueAt: current.dueAt },
              data,
              now()
            )
          }
          const card = this.cardRepo.patch(id, data, tagIds)
          const out =
            columnId && current.columnId !== columnId
              ? this.moveCard({ cardId: id, columnId, index: 1_000_000 })
              : undefined
          this.boardRepo.touch(card.boardId)
          return [card, out] as const
        })
        return { ...((await getDetails(id)) ?? card), ...(repeatOutcome ? { repeatOutcome } : {}) }
      },
      remove: async (id) => this.cardRepo.softDelete(idArg.parse(id)),
      move: async (input) => this.moveCard(input),
      due: async (args) =>
        this.due(
          z.object({ from: z.number(), to: z.number(), boardId: idArg.optional() }).parse(args)
        ),
      addCheck: async (args) => {
        const { cardId, text } = cardCheckInputSchema.extend({ cardId: idArg }).parse(args)
        this.cardRepo.rowOrThrow(cardId)
        const position = nextPosition(
          this.m.db,
          cardChecklist.position,
          eq(cardChecklist.cardId, cardId)
        )
        const entry = { id: newId(), cardId, text, done: false, position }
        this.db.insert(cardChecklist).values(entry).run()
        this.cardRepo.touch(cardId)
        return entry
      },
      updateCheck: async (args) => {
        const { id, ...patch } = z
          .object({
            id: idArg,
            text: cardCheckInputSchema.shape.text.optional(),
            done: z.boolean().optional()
          })
          .parse(args)
        const entry = this.db
          .update(cardChecklist)
          .set(patch)
          .where(eq(cardChecklist.id, id))
          .returning()
          .get()
        if (!entry) throw new NotFoundError('Пункт', id)
        this.cardRepo.touch(entry.cardId)
        return entry
      },
      removeCheck: async (id) => {
        this.db
          .delete(cardChecklist)
          .where(eq(cardChecklist.id, idArg.parse(id)))
          .run()
      },
      reorderChecks: async (args) => {
        const { cardId, ids } = z.object({ cardId: idArg, ids: orderedIds }).parse(args)
        reorder(this.m.db, cardChecklist, cardChecklist.id, ids, eq(cardChecklist.cardId, cardId))
      }
    }
  }
}
