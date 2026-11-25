import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('a CRM project’s boards', () => {
  it('a board made for a project is listed by it, other boards are not', async () => {
    const p = await v.api.projects.create({ title: 'Редизайн' })
    const own = await v.api.boards.create({ title: 'Редизайн', projectId: p.id })
    await v.api.boards.create({ title: 'Особиста' })
    const list = await v.api.boards.list({ projectId: p.id })
    expect(list.map((b) => b.id)).toEqual([own.id])
    expect(list[0].projectId).toBe(p.id)
    // The usual columns come with it, as for any new board.
    expect((await v.api.boards.details(own.id))!.columns.length).toBeGreaterThan(0)
  })
})
