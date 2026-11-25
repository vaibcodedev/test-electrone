/** Tags on a real database: the count on a tag matches the records it opens. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

const usage = (tagId: string): number | undefined => v.tags.list().find((t) => t.id === tagId)?.usage

describe('tag usage', () => {
  it('records in the trash and cards of a deleted board are not counted', async () => {
    const tag = v.tags.create({ name: 'Важливо', color: null })
    const board = await v.api.boards.create({ title: 'Дошка', tagIds: [tag.id] })
    const col = v.boards.columns(board.id)[0]
    await v.api.cards.create({ boardId: board.id, columnId: col.id, title: 'Задача', tagIds: [tag.id] })
    expect(usage(tag.id)).toBe(2)
    await v.api.boards.remove(board.id)
    expect(usage(tag.id)).toBe(0)
    expect(v.tags.entities(tag.id)).toEqual([])
    v.trash.restore({ type: 'board', id: board.id })
    expect(usage(tag.id)).toBe(2)
  })

  it('the list of a tag pages after dropping records in the trash', async () => {
    const tag = v.tags.create({ name: 'Проєкт', color: null })
    const ids: string[] = []
    for (const title of ['A', 'B', 'C']) ids.push((await v.api.boards.create({ title, tagIds: [tag.id] })).id)
    await v.api.boards.remove(ids[1])
    const all = v.tags.entities(tag.id).map((e) => e.id)
    expect(all.sort()).toEqual([ids[0], ids[2]].sort())
    expect(v.tags.entities(tag.id, { limit: 1, offset: 1 })).toHaveLength(1)
  })
})
