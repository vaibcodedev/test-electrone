/** JSON import on a real database. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('import is all or nothing', () => {
  it('an error on the N-th item rolls back the items before it', async () => {
    v.importer.register('idea', async (data) => {
      const items = data as { title: string }[]
      items.forEach((it, i) => {
        if (i === 2) throw new Error('boom')
        v.boards.createBoard({ title: it.title })
      })
      return { created: items.length }
    })
    await expect(
      v.importer.run({ kind: 'idea', payload: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] })
    ).rejects.toThrow('boom')
    expect(v.boards.listBoards()).toEqual([])
  })
})
