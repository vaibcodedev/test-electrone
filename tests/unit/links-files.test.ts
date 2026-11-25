/** Links and attachments on a real database: nothing attaches to a record that is gone. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { NotFoundError } from '@main/core/util'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('links and files of a record in the trash', () => {
  it('a link to a record in the trash is refused', async () => {
    const a = await v.api.boards.create({ title: 'A' })
    const b = await v.api.boards.create({ title: 'B' })
    await v.api.boards.remove(b.id)
    expect(() => v.links.create({ fromType: 'board', fromId: a.id, toType: 'board', toId: b.id })).toThrow(/не знайдено/)
  })

  it('a file is not copied for a record in the trash', async () => {
    const b = await v.api.boards.create({ title: 'B' })
    await v.api.boards.remove(b.id)
    const source = join(v.dir, 'notes.txt')
    writeFileSync(source, 'x')
    await expect(v.m.attachments.add({ type: 'board', id: b.id }, { kind: 'path', path: source })).rejects.toThrow(NotFoundError)
    const filesDir = join(v.dir, 'files')
    expect(existsSync(filesDir) ? readdirSync(filesDir) : []).toEqual([])
  })
})
