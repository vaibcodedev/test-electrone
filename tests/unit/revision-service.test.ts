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
    await v.api.events.update({
      id: event.id,
      patch: { startAt: event.startAt + 24 * HOUR, endAt: event.endAt! + 24 * HOUR }
    })
    v.revisions.revert({ type: 'event', id: event.id }, snap)
    const stage = v.db.orm
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, stageId))
      .get()
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

describe('«Скасувати» on a checklist rolls its items back', () => {
  const texts = async (id: string): Promise<string[]> =>
    ((await v.api.checklists.get(id))?.items ?? []).map((i) => i.text)

  it('added, removed and renamed items return to the snapshot; ticks are not an edit', async () => {
    const list = await v.api.checklists.create({ title: 'Реліз', kind: 'template' })
    const one = await v.api.checklists.addItem({ checklistId: list.id, text: 'Тести' })
    const two = await v.api.checklists.addItem({ checklistId: list.id, text: 'Збірка' })
    const three = await v.api.checklists.addItem({ checklistId: list.id, text: 'Тег' })
    const ref = { type: 'checklist' as const, id: list.id }
    const snap = v.revisions.snapshot(ref)

    await v.api.checklists.updateItem({ id: one.id, patch: { done: true } })
    expect(v.revisions.changed(ref, snap)).toBe(false)

    await v.api.checklists.addItem({ checklistId: list.id, text: 'Зайвий' })
    await v.api.checklists.removeItem(two.id)
    await v.api.checklists.updateItem({ id: three.id, patch: { text: 'Реліз на GitHub' } })
    expect(v.revisions.changed(ref, snap)).toBe(true)

    v.revisions.revert(ref, snap)
    expect(await texts(list.id)).toEqual(['Тести', 'Збірка', 'Тег'])
    expect(v.revisions.changed(ref, snap)).toBe(false)
    // The tick made meanwhile stays: it belongs to the run, not to the edit.
    expect((await v.api.checklists.get(list.id))?.items[0].done).toBe(true)
  })

  it('a tampered snapshot is refused and changes nothing', async () => {
    const list = await v.api.checklists.create({ title: 'Реліз', kind: 'template' })
    await v.api.checklists.addItem({ checklistId: list.id, text: 'Тести' })
    const ref = { type: 'checklist' as const, id: list.id }
    const snap = { ...v.revisions.snapshot(ref), children: [{ id: 'x', text: '' }] }
    expect(() => v.revisions.revert(ref, snap)).toThrow(/Знімок пунктів/)
    expect(await texts(list.id)).toEqual(['Тести'])
  })
})

describe('«Зберегти» on a new record keeps it, even under the default title and empty', () => {
  it('a saved empty «Нова добірка» is no longer an empty draft: leaving keeps it, a new one is added', async () => {
    const first = await v.api.moodboards.create({ title: 'Нова добірка' })
    const ref = { type: 'moodboard' as const, id: first.id }
    expect(v.revisions.keep(ref)).toBe(true)
    // Leaving the page asks main to discard an empty draft: the saved one stays.
    expect(v.trash.discardDraft(ref)).toBe(false)
    // «+ Створити» reuses an untouched empty draft; the saved one is not reused.
    const second = await v.api.moodboards.create({ title: 'Нова добірка' })
    expect(second.id).not.toBe(first.id)
    expect((await v.api.moodboards.list({})).map((m) => m.id).sort()).toEqual(
      [first.id, second.id].sort()
    )
  })

  it('without «Зберегти» an untouched draft still goes, and a record edited before is left alone', async () => {
    const draft = await v.api.moodboards.create({ title: 'Нова добірка' })
    expect(v.trash.discardDraft({ type: 'moodboard', id: draft.id })).toBe(true)

    const edited = await v.api.moodboards.create({ title: 'Дашборди' })
    await v.api.moodboards.update({ id: edited.id, patch: { title: 'Темні дашборди' } })
    const before = (await v.api.moodboards.get(edited.id))?.updatedAt
    expect(v.revisions.keep({ type: 'moodboard', id: edited.id })).toBe(false)
    expect((await v.api.moodboards.get(edited.id))?.updatedAt).toBe(before)
  })
})
