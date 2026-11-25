/** Time tracking on a real database: one running timer, closed with its project. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { timeEntries } from '@main/db/schema'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => {
  vi.useRealTimers()
  v.close()
})

describe('project in the trash stops its timer', () => {
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

describe('editing a time entry', () => {
  it('a finished entry cannot be reopened into a second running timer', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    const e = await v.api.time.create({ projectId: p.id, startedAt: Date.now() - 3600_000, endedAt: Date.now() })
    await expect(v.api.time.update({ id: e.id, patch: { endedAt: null } })).rejects.toThrow(/новий таймер/)
  })

  it('moving an entry to a missing project is a readable error', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    const e = await v.api.time.create({ projectId: p.id, startedAt: Date.now() - 3600_000, endedAt: Date.now() })
    await expect(v.api.time.update({ id: e.id, patch: { projectId: 'missing' } })).rejects.toThrow(/не знайдено/)
  })
})
