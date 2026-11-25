/** Markdown export on a real database. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import type { AppPaths } from '@main/core/paths'
import { ExportService } from '@main/services/export-service'
import { unzipAsync } from '@main/core/zip'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('Markdown export', () => {
  it('lists a board with its live cards; a trashed card is not exported', async () => {
    const board = await v.api.boards.create({ title: 'Реліз' })
    const col = v.boards.columns(board.id)[0]
    await v.api.cards.create({ boardId: board.id, columnId: col.id, title: 'Жива' })
    const gone = await v.api.cards.create({ boardId: board.id, columnId: col.id, title: 'Видалена' })
    await v.api.cards.remove(gone.id)
    const exporter = new ExportService(v.db, { filesDir: join(v.dir, 'files') } as AppPaths, v.registry, v.tags, v.links)
    const files = await unzipAsync(await exporter.markdownZip())
    const text = Object.entries(files)
      .filter(([name]) => name.endsWith('.md'))
      .map(([, bytes]) => new TextDecoder().decode(bytes))
      .join('\n')
    expect(text).toContain('- [ ] Жива')
    expect(text).not.toContain('Видалена')
  })
})
