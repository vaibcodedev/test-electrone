/**
 * Trash, revert and module side effects on a real database: what the user sees after «Відновити»,
 * «Видалити назавжди» and «Скасувати» must match what they saw before deleting/editing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { applicationStages, cards, events, timeEntries } from '@main/db/schema'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const HOUR = 3600_000

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => {
  vi.useRealTimers()
  v.close()
})

async function vacancyWithInterview(): Promise<{ appId: string; stageId: string }> {
  const app = await v.api.jobs.create({ title: 'Frontend', companyName: 'Acme' })
  const stage = await v.api.jobs.addStage({ applicationId: app.id, kind: 'technical', at: Date.now() + 48 * HOUR })
  return { appId: app.id, stageId: stage.id }
}

const stageEvents = (stageId: string): (typeof events.$inferSelect)[] => v.db.orm.select().from(events).where(eq(events.sourceId, stageId)).all()

describe('vacancy in the trash keeps its interviews (main-b-04)', () => {
  it('restore brings the interview back to the calendar — once, not as a second event', async () => {
    const { appId, stageId } = await vacancyWithInterview()
    await v.api.jobs.remove(appId)
    expect(stageEvents(stageId).every((e) => e.deletedAt !== null)).toBe(true)

    v.trash.restore({ type: 'application', id: appId })

    const list = stageEvents(stageId)
    expect(list).toHaveLength(1)
    expect(list[0].deletedAt).toBeNull()
    expect(v.trash.list().some((t) => t.type === 'event')).toBe(false)
  })

  it('a stage edited after the restore updates that event instead of creating a duplicate', async () => {
    const { appId, stageId } = await vacancyWithInterview()
    await v.api.jobs.remove(appId)
    v.trash.restore({ type: 'application', id: appId })
    await v.api.jobs.updateStage({ id: stageId, patch: { at: Date.now() + 72 * HOUR } })
    expect(stageEvents(stageId)).toHaveLength(1)
  })

  it('purge deletes the stage events for good, they do not stay in the trash as orphans', async () => {
    const { appId, stageId } = await vacancyWithInterview()
    await v.api.jobs.remove(appId)
    v.trash.purge({ type: 'application', id: appId })
    expect(stageEvents(stageId)).toEqual([])
    expect(v.trash.list()).toEqual([])
  })
})

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

describe('cards of a deleted column (main-b-05)', () => {
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

describe('«Готово» column flag (main-b-19)', () => {
  it('saving the column without flipping isDone keeps the completion dates', async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const done = v.boards.columns(board.id).find((c) => c.isDone)!
    const card = await v.api.cards.create({ boardId: board.id, columnId: done.id, title: 'Давно зроблено' })
    v.db.orm.update(cards).set({ completedAt: 1000 }).where(eq(cards.id, card.id)).run()
    await v.api.boards.updateColumn({ id: done.id, patch: { title: 'Зроблено', isDone: true } })
    expect(v.db.orm.select().from(cards).where(eq(cards.id, card.id)).get()?.completedAt).toBe(1000)
  })
})

describe('project in the trash stops its timer (main-b-08)', () => {
  it('the running entry is closed when the project is deleted', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const p = await v.api.projects.create({ title: 'Сайт' })
    await v.api.time.start({ projectId: p.id })
    vi.setSystemTime(Date.now() + 5 * 60_000)
    await v.api.projects.remove(p.id)
    const entries = v.db.orm.select().from(timeEntries).where(eq(timeEntries.projectId, p.id)).all()
    expect(entries).toHaveLength(1)
    expect(entries[0].endedAt).not.toBeNull()
    expect(entries[0].minutes).toBe(5)
  })
})

describe('«Скасувати» undoes side effects of the edit (main-b-06, main-b-07)', () => {
  it('moving an interview back in the calendar moves its stage back too', async () => {
    const { stageId } = await vacancyWithInterview()
    const event = stageEvents(stageId)[0]
    const snap = v.revisions.snapshot({ type: 'event', id: event.id })
    await v.api.events.update({ id: event.id, patch: { startAt: event.startAt + 24 * HOUR, endAt: event.endAt! + 24 * HOUR } })
    v.revisions.revert({ type: 'event', id: event.id }, snap)
    const stage = v.db.orm.select().from(applicationStages).where(eq(applicationStages.id, stageId)).get()
    expect(stage?.at).toBe(event.startAt)
  })

  it('a cover replaced while editing: the old file is gone, so the new one stays', async () => {
    const c = await v.api.components.create({ title: 'Кнопка' })
    mkdirSync(join(v.dir, 'files'), { recursive: true })
    writeFileSync(join(v.dir, 'files', 'new.png'), 'x')
    const snap = v.revisions.snapshot({ type: 'component', id: c.id })
    snap.row.coverPath = 'old-deleted.png'
    v.media.componentRepo.patch(c.id, { coverPath: 'new.png' })
    v.revisions.revert({ type: 'component', id: c.id }, snap)
    expect(v.media.componentRepo.row(c.id)?.coverPath).toBe('new.png')
    expect(existsSync(join(v.dir, 'files', 'new.png'))).toBe(true)
  })

  it('a cover added while editing is removed with its file when there was none', async () => {
    const c = await v.api.components.create({ title: 'Кнопка' })
    mkdirSync(join(v.dir, 'files'), { recursive: true })
    writeFileSync(join(v.dir, 'files', 'added.png'), 'x')
    const snap = v.revisions.snapshot({ type: 'component', id: c.id })
    v.media.componentRepo.patch(c.id, { coverPath: 'added.png' })
    v.revisions.revert({ type: 'component', id: c.id }, snap)
    expect(v.media.componentRepo.row(c.id)?.coverPath).toBeNull()
    expect(existsSync(join(v.dir, 'files', 'added.png'))).toBe(false)
  })
})

describe('proposal → contract (main-b-09)', () => {
  it('a second «hire» (double click, retry) creates no second project or client', async () => {
    const platform = await v.api.platforms.create({ name: 'Upwork' })
    const p = await v.api.proposals.create({ platformId: platform.id, jobTitle: 'Лендинг', clientName: 'Acme' })
    const hire = { proposalId: p.id, title: 'Лендинг', billing: 'fixed' as const, amount: 500, feePercent: 10 }
    await v.api.proposals.hire(hire)
    await expect(v.api.proposals.hire(hire)).rejects.toThrow(/уже перетворено/)
    expect(await v.api.projects.list()).toHaveLength(1)
    expect(await v.api.clients.list()).toHaveLength(1)
  })

  it('an unknown client id is a readable error, not a foreign key failure', async () => {
    const platform = await v.api.platforms.create({ name: 'Upwork' })
    const p = await v.api.proposals.create({ platformId: platform.id, jobTitle: 'Лендинг' })
    await expect(
      v.api.proposals.hire({ proposalId: p.id, clientId: 'missing', title: 'X', billing: 'fixed', amount: 1, feePercent: 0 })
    ).rejects.toThrow(/не знайдено/)
  })
})

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
