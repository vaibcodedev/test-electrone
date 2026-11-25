/** SoftRepository and the search index on a real database: drafts, paging, trash and search together. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('templates, checklists and components reuse their untouched drafts too', async () => {
    const t1 = await v.api.templates.create({ title: 'Новий шаблон', situation: 'proposal' })
    const t2 = await v.api.templates.create({ title: 'Новий шаблон', situation: 'proposal' })
    expect(t2.id).toBe(t1.id)
    expect(v.trash.discardDraft({ type: 'template', id: t1.id })).toBe(true)

    const c1 = await v.api.checklists.create({ title: 'Новий чек-лист', kind: 'template' })
    const c2 = await v.api.checklists.create({ title: 'Новий чек-лист', kind: 'template' })
    expect(c2.id).toBe(c1.id)

    const u1 = await v.api.components.create({ title: 'Новий компонент', code: '' })
    const u2 = await v.api.components.create({ title: 'Новий компонент', code: '' })
    expect(u2.id).toBe(u1.id)
  })

  it('an imported checklist with the default title and items is not a draft', async () => {
    const imported = await v.api.checklists.importTemplate({ title: 'Новий чек-лист', sections: [{ items: ['Пункт'] }] })
    const fresh = await v.api.checklists.create({ title: 'Новий чек-лист', kind: 'template' })
    expect(fresh.id).not.toBe(imported.id)
    expect(v.trash.discardDraft({ type: 'checklist', id: imported.id })).toBe(false)
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
