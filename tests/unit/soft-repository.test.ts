/** SoftRepository and the search index on a real database: drafts, paging, trash and search together. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stageOf } from '@main/core/srs'
import { words } from '@main/db/schema'
import { eq } from 'drizzle-orm'
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

const found = (text: string): string[] => v.search.query({ text }).map((h) => `${h.type}:${h.id}`)

describe('SoftRepository', () => {
  it('«+ Створити» with an untouched draft open reuses it', async () => {
    const a = await v.api.jobs.createQuestion({ question: 'Нове питання' })
    const b = await v.api.jobs.createQuestion({ question: 'Нове питання' })
    expect(b.id).toBe(a.id)
  })

  it('pages never repeat or skip rows stamped in the same millisecond', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    for (let i = 0; i < 7; i++) await v.api.projects.create({ title: `P${i}` })
    vi.useRealTimers()
    const pages = [0, 3, 6].map((offset) => v.crm.projectRepo.listWhere([], undefined, 3, offset).map((p) => p.id))
    const all = v.crm.projectRepo.listWhere([]).map((p) => p.id)
    expect(pages.flat()).toEqual(all)
    expect(new Set(pages.flat()).size).toBe(7)
  })

  it('a board in the trash takes its cards out of search; restore brings them back', async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const col = v.boards.columns(board.id)[0]
    const card = await v.api.cards.create({ boardId: board.id, columnId: col.id, title: 'Кракозябра' })
    expect(found('кракозябра')).toContain(`card:${card.id}`)
    await v.api.boards.remove(board.id)
    expect(found('кракозябра')).toEqual([])
    v.trash.restore({ type: 'board', id: board.id })
    expect(found('кракозябра')).toContain(`card:${card.id}`)
  })

  it('rebuild indexes every live record once', async () => {
    await v.api.boards.create({ title: 'Перебудова' })
    v.search.rebuild()
    v.search.rebuild()
    expect(found('перебудова')).toHaveLength(1)
  })
})

describe('word stage filter runs in SQL and matches stageOf (main-b-21)', () => {
  it.each([
    [null, 0],
    [1, 6],
    [1, 7],
    [1, 29],
    [1, 30]
  ])('lastReviewedAt=%s, interval=%s', async (reviewed, intervalDays) => {
    const w = await v.api.english.create({ term: `w${intervalDays}`, translation: 't' })
    v.db.orm.update(words).set({ lastReviewedAt: reviewed, intervalDays }).where(eq(words.id, w.id)).run()
    const stage = stageOf({ intervalDays, lastReviewedAt: reviewed })
    expect((await v.api.english.list({ stage })).map((x) => x.id)).toEqual([w.id])
    for (const other of (['new', 'learning', 'review', 'mastered'] as const).filter((s) => s !== stage)) {
      expect(await v.api.english.list({ stage: other })).toEqual([])
    }
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

describe('Markdown export (main-b-18)', () => {
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
