/** Boards on a real database: columns, the «Готово» flag and manual order. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { cards } from '@main/db/schema'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

async function boardWithCardInSecondColumn(): Promise<{
  board: { id: string }
  cols: { id: string }[]
  card: { id: string }
}> {
  const board = await v.api.boards.create({ title: 'Дошка' })
  const cols = v.boards.columns(board.id)
  const card = await v.api.cards.create({ boardId: board.id, columnId: cols[1].id, title: 'Задача' })
  return { board, cols, card }
}

describe('cards of a deleted column', () => {
  it('a restored card lands in the first column of its board, visible again', async () => {
    const { board, cols, card } = await boardWithCardInSecondColumn()
    await v.api.boards.removeColumn({ id: cols[1].id, moveCardsTo: null })
    v.trash.restore({ type: 'card', id: card.id })
    const details = await v.api.boards.details(board.id)
    expect(details?.cards.map((c) => [c.id, c.columnId])).toEqual([[card.id, cols[0].id]])
  })

  it('cards can be moved only to another column of the same board', async () => {
    const { cols } = await boardWithCardInSecondColumn()
    const other = await v.api.boards.create({ title: 'Інша' })
    const foreign = v.boards.columns(other.id)[0]
    await expect(v.api.boards.removeColumn({ id: cols[1].id, moveCardsTo: cols[1].id })).rejects.toThrow(/іншу колонку/)
    await expect(v.api.boards.removeColumn({ id: cols[1].id, moveCardsTo: foreign.id })).rejects.toThrow(/іншу колонку/)
  })
})

describe('«Готово» column flag', () => {
  it('saving the column without flipping isDone keeps the completion dates', async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const done = v.boards.columns(board.id).find((c) => c.isDone)!
    const card = await v.api.cards.create({ boardId: board.id, columnId: done.id, title: 'Давно зроблено' })
    v.db.orm.update(cards).set({ completedAt: 1000 }).where(eq(cards.id, card.id)).run()
    await v.api.boards.updateColumn({ id: done.id, patch: { title: 'Зроблено', isDone: true } })
    expect(v.db.orm.select().from(cards).where(eq(cards.id, card.id)).get()?.completedAt).toBe(1000)
  })

  it('moving a closed card to another «Готово» column, or with its column deleted, keeps the date', async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const done = v.boards.columns(board.id).find((c) => c.isDone)!
    const archive = await v.api.boards.addColumn({ boardId: board.id, input: { title: 'Архів', isDone: true } })
    const card = await v.api.cards.create({ boardId: board.id, columnId: done.id, title: 'Давно зроблено' })
    const completedAt = (): number | null | undefined =>
      v.db.orm.select().from(cards).where(eq(cards.id, card.id)).get()?.completedAt
    v.db.orm.update(cards).set({ completedAt: 1000 }).where(eq(cards.id, card.id)).run()

    await v.api.cards.move({ cardId: card.id, columnId: archive.id, index: 0 })
    expect(completedAt()).toBe(1000)
    await v.api.boards.removeColumn({ id: archive.id, moveCardsTo: done.id })
    expect(completedAt()).toBe(1000)
  })
})

describe('repeating cards', () => {
  const DAY = 86_400_000
  async function repeating(repeat: { freq: 'daily' } | { freq: 'weekly'; days: number[] } = { freq: 'daily' }) {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const cols = v.boards.columns(board.id)
    const done = cols.find((c) => c.isDone)!
    const tag = v.tags.create({ name: 'щодня', color: null })
    const dueAt = new Date(Date.now() + 2 * DAY).setHours(9, 15, 0, 0)
    const card = await v.api.cards.create({
      boardId: board.id,
      columnId: cols[1].id,
      title: 'Щоденний звіт',
      description: 'Опис',
      priority: 'high',
      dueAt,
      repeat,
      tagIds: [tag.id]
    })
    await v.api.cards.addCheck({ cardId: card.id, text: 'Пункт' })
    const [check] = v.boards.checklist(card.id)
    await v.api.cards.updateCheck({ id: check.id, done: true })
    return { board, cols, done, card, dueAt, tag }
  }
  const live = async (boardId: string) => (await v.api.boards.details(boardId))!.cards

  it('a move into «Готово» creates the next card: first column, copy of the card, unticked checklist', async () => {
    const { board, cols, done, card, dueAt, tag } = await repeating()
    const out = await v.api.cards.move({ cardId: card.id, columnId: done.id, index: 0 })
    expect(out?.spawned).toHaveLength(1)
    const next = (await live(board.id)).find((c) => c.id !== card.id)!
    expect(out?.spawned?.[0]).toEqual({ id: next.id, title: 'Щоденний звіт', dueAt: next.dueAt })
    expect(next).toMatchObject({
      columnId: cols[0].id,
      description: 'Опис',
      priority: 'high',
      repeat: { freq: 'daily' },
      completedAt: null,
      repeatNextId: null
    })
    expect(next.tags.map((t) => t.id)).toEqual([tag.id])
    expect(next.dueAt).toBe(new Date(dueAt).setDate(new Date(dueAt).getDate() + 1))
    expect(v.boards.checklist(next.id).map((e) => [e.text, e.done])).toEqual([['Пункт', false]])
    expect((await v.api.cards.get(card.id))?.repeatNextId).toBe(next.id)
  })

  it('once per card: back and into «Готово» again, even after the next one was deleted', async () => {
    const { board, cols, done, card } = await repeating()
    const first = await v.api.cards.move({ cardId: card.id, columnId: done.id, index: 0 })
    await v.api.cards.remove(first!.spawned![0].id)
    await v.api.cards.move({ cardId: card.id, columnId: cols[1].id, index: 0 })
    const again = await v.api.cards.update({ id: card.id, patch: { columnId: done.id } })
    expect(again.repeatOutcome?.spawned).toBeUndefined()
    expect(await live(board.id)).toHaveLength(1)
  })

  it('no next card: done → done, created in «Готово», «Готово» flag switched on, a card that doesn’t repeat', async () => {
    const { board, cols, done, card } = await repeating()
    const archive = await v.api.boards.addColumn({ boardId: board.id, input: { title: 'Архів', isDone: true } })
    const inDone = await v.api.cards.create({
      boardId: board.id,
      columnId: done.id,
      title: 'Одразу готова',
      repeat: { freq: 'daily' }
    })
    expect((await v.api.cards.move({ cardId: inDone.id, columnId: archive.id, index: 0 }))?.spawned).toBeUndefined()
    await v.api.boards.updateColumn({ id: cols[1].id, patch: { isDone: true } })
    const plain = await v.api.cards.create({ boardId: board.id, columnId: cols[0].id, title: 'Звичайна' })
    expect((await v.api.cards.move({ cardId: plain.id, columnId: done.id, index: 0 }))?.spawned).toBeUndefined()
    expect((await v.api.cards.get(card.id))?.repeatNextId).toBeNull()
    expect(await live(board.id)).toHaveLength(3)
  })

  it('«Перенести й видалити» into «Готово» spawns; with no other column left the toast is told why', async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const cols = v.boards.columns(board.id)
    const done = cols.find((c) => c.isDone)!
    const card = await v.api.cards.create({
      boardId: board.id,
      columnId: cols[2].id,
      title: 'Щотижня',
      repeat: { freq: 'weekly', days: [3, 1] }
    })
    expect(card.repeat).toEqual({ freq: 'weekly', days: [1, 3] })
    const out = await v.api.boards.removeColumn({ id: cols[2].id, moveCardsTo: done.id })
    expect(out && out.spawned?.map((s) => s.title)).toEqual(['Щотижня'])

    // Only «Готово» columns besides the one going away: no next card, the card keeps no mark.
    const lone = await v.api.boards.create({ title: 'Самотня' })
    const [backlog, , , loneDone] = v.boards.columns(lone.id)
    for (const c of v.boards.columns(lone.id).slice(1, 3))
      await v.api.boards.removeColumn({ id: c.id, moveCardsTo: null })
    const daily = await v.api.cards.create({
      boardId: lone.id,
      columnId: backlog.id,
      title: 'Без колонки',
      repeat: { freq: 'daily' }
    })
    const blocked = await v.api.boards.removeColumn({ id: backlog.id, moveCardsTo: loneDone.id })
    expect(blocked && blocked.blocked).toEqual(['Без колонки'])
    expect((await v.api.cards.get(daily.id))?.repeatNextId).toBeNull()
  })

  it('«Скасувати» of the edit that moved it into «Готово» keeps the mark: no second next card', async () => {
    const { board, cols, done, card } = await repeating()
    const snap = v.revisions.snapshot({ type: 'card', id: card.id })
    await v.api.cards.update({ id: card.id, patch: { columnId: done.id } })
    v.revisions.revert({ type: 'card', id: card.id }, snap)
    const back = await v.api.cards.get(card.id)
    expect(back?.columnId).toBe(cols[1].id)
    expect(back?.repeatNextId).not.toBeNull()
    await v.api.cards.move({ cardId: card.id, columnId: done.id, index: 0 })
    expect(await live(board.id)).toHaveLength(2)
  })

  it('a monthly rule keeps «31-го» on the next card and resets it when the deadline moves to another day', async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const cols = v.boards.columns(board.id)
    const done = cols.find((c) => c.isDone)!
    const card = await v.api.cards.create({
      boardId: board.id,
      columnId: cols[0].id,
      title: 'Рахунок',
      dueAt: new Date(2099, 0, 31, 10).getTime(),
      repeat: { freq: 'monthly' }
    })
    expect(card.repeat).toEqual({ freq: 'monthly', day: 31 })
    const out = await v.api.cards.move({ cardId: card.id, columnId: done.id, index: 0 })
    const next = (await v.api.cards.get(out!.spawned![0].id))!
    expect(new Date(next.dueAt!).getDate()).toBe(28)
    expect(next.repeat).toEqual({ freq: 'monthly', day: 31 })
    const moved = await v.api.cards.update({
      id: next.id,
      patch: { dueAt: new Date(2099, 1, 10, 10).getTime() }
    })
    expect(moved.repeat).toEqual({ freq: 'monthly', day: 10 })
  })
})

describe('manual order (core/ordering)', () => {
  it('reordering columns ignores ids of another board', async () => {
    const a = await v.api.boards.create({ title: 'A' })
    const b = await v.api.boards.create({ title: 'B' })
    const colsA = v.boards.columns(a.id).map((c) => c.id)
    const foreign = v.boards.columns(b.id)[0]
    await v.api.boards.reorderColumns({ boardId: a.id, ids: [foreign.id, ...[...colsA].reverse()] })
    expect(v.boards.columns(a.id).map((c) => c.id)).toEqual([...colsA].reverse())
    expect(v.boards.columns(b.id)[0].id).toBe(foreign.id)
  })
})
