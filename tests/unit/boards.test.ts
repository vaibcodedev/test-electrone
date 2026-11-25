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
