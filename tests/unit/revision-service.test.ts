/** «Скасувати» on a real database: the edit is rolled back together with its side effects. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { applicationStages } from '@main/db/schema'
import { openVault, type Vault } from './support/vault'
import { HOUR, stageEvents, vacancyWithInterview } from './support/jobs'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('«Скасувати» undoes side effects of the edit', () => {
  it('moving an interview back in the calendar moves its stage back too', async () => {
    const { stageId } = await vacancyWithInterview(v)
    const event = stageEvents(v, stageId)[0]
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
