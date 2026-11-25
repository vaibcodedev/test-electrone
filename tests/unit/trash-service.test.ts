/**
 * Trash on a real database: what the user sees after «Відновити» and «Видалити назавжди» must match what
 * they saw before deleting — vacancies with their calendar events above all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { EventBus } from '@main/core/event-bus'
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

const feedIds = (): string[] =>
  v.calendar.feed(Date.now() - 24 * HOUR, Date.now() + 30 * 24 * HOUR).map((i) => i.ref.id)

describe('vacancy in the trash keeps its interviews', () => {
  it('the interviews are hidden with the vacancy, not put into the trash one by one', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    await v.api.jobs.remove(appId)
    const [event] = stageEvents(v, stageId)
    expect(event.deletedAt).toBeNull()
    expect(feedIds()).not.toContain(event.id)
    expect(v.trash.list().map((t) => t.type)).toEqual(['application'])
    expect(v.trash.count()).toBe(1)
  })

  it('restore brings the interview back to the calendar — once, not as a second event', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    await v.api.jobs.remove(appId)
    v.trash.restore({ type: 'application', id: appId })

    const list = stageEvents(v, stageId)
    expect(list).toHaveLength(1)
    expect(list[0].deletedAt).toBeNull()
    expect(feedIds()).toContain(list[0].id)
    expect(v.trash.list()).toEqual([])
  })

  it('an interview put into the trash by an older version comes back with the vacancy, not twice', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    const [event] = stageEvents(v, stageId)
    v.calendar.repo.softDelete(event.id)
    await v.api.jobs.remove(appId)
    v.jobs.tidy()
    expect(v.trash.list().map((t) => t.type)).toEqual(['application'])
    v.trash.restore({ type: 'application', id: appId })
    expect(stageEvents(v, stageId).map((e) => [e.id, e.deletedAt])).toEqual([[event.id, null]])
  })

  it('an interview of a vacancy in the trash can only be restored with the vacancy', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    const [event] = stageEvents(v, stageId)
    v.calendar.repo.softDelete(event.id)
    await v.api.jobs.remove(appId)
    expect(() => v.trash.restore({ type: 'event', id: event.id })).toThrow(/відновіть вакансію/)
  })

  it('a stage removed from the vacancy takes its events along, past the trash', async () => {
    const { stageId } = await vacancyWithInterview(v)
    await v.api.jobs.removeStage(stageId)
    expect(stageEvents(v, stageId)).toEqual([])
    expect(v.trash.list()).toEqual([])
  })

  it('a cancelled stage deletes its event for good: planning it again gives one event', async () => {
    const { stageId } = await vacancyWithInterview(v)
    await v.api.jobs.updateStage({ id: stageId, patch: { status: 'cancelled' } })
    expect(stageEvents(v, stageId)).toEqual([])
    expect(v.trash.list()).toEqual([])
    await v.api.jobs.updateStage({ id: stageId, patch: { status: 'planned' } })
    expect(stageEvents(v, stageId)).toHaveLength(1)
  })

  it('a stage edited after the restore updates that event instead of creating a duplicate', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    await v.api.jobs.remove(appId)
    v.trash.restore({ type: 'application', id: appId })
    await v.api.jobs.updateStage({ id: stageId, patch: { at: Date.now() + 72 * HOUR } })
    expect(stageEvents(v, stageId)).toHaveLength(1)
  })

  it('purge deletes the stage events for good, they do not stay in the trash as orphans', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    await v.api.jobs.remove(appId)
    v.trash.purge({ type: 'application', id: appId })
    expect(stageEvents(v, stageId)).toEqual([])
    expect(v.trash.list()).toEqual([])
  })
})

describe('stage events belong to the stage', () => {
  it('an interview in the trash (older data) comes back on the next sync instead of a duplicate', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    const [event] = stageEvents(v, stageId)
    v.calendar.repo.softDelete(event.id)
    await v.api.jobs.update({ id: appId, patch: { companyName: 'Acme Corp' } })
    const list = stageEvents(v, stageId)
    expect(list.map((e) => [e.id, e.deletedAt])).toEqual([[event.id, null]])
    expect(list[0].title).toContain('Acme Corp')
    expect(v.trash.list()).toEqual([])
  })

  it('the calendar refuses to delete a stage event and says where to do it', async () => {
    const { stageId } = await vacancyWithInterview(v)
    const [event] = stageEvents(v, stageId)
    await expect(v.api.events.remove(event.id)).rejects.toThrow(/етап у самій вакансії/)
    expect(stageEvents(v, stageId)[0].deletedAt).toBeNull()
  })

  it('a stage of a vacancy in the trash cannot be edited', async () => {
    const { appId, stageId } = await vacancyWithInterview(v)
    await v.api.jobs.remove(appId)
    await expect(v.api.jobs.updateStage({ id: stageId, patch: { title: 'X' } })).rejects.toThrow()
  })

  it('ordinary events stay visible next to hidden stage events', async () => {
    const { appId } = await vacancyWithInterview(v)
    const own = await v.api.events.create({ title: 'Зустріч', startAt: Date.now() + HOUR })
    await v.api.jobs.remove(appId)
    expect(feedIds()).toEqual([own.id])
    expect((await v.api.events.list()).map((e) => e.id)).toEqual([own.id])
  })
})

describe('a stale stage event older versions left in the trash', () => {
  /** Older versions trashed the event of a cancelled stage and cleared stage.eventId. */
  async function staleEvent(): Promise<{ stageId: string; eventId: string; at: number | null }> {
    const { stageId } = await vacancyWithInterview(v)
    const [event] = stageEvents(v, stageId)
    v.calendar.repo.softDelete(event.id)
    v.db.orm
      .update(applicationStages)
      .set({ status: 'cancelled', eventId: null })
      .where(eq(applicationStages.id, stageId))
      .run()
    const stage = v.db.orm
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, stageId))
      .get()
    return { stageId, eventId: event.id, at: stage?.at ?? null }
  }
  const stageAt = (stageId: string): number | null | undefined =>
    v.db.orm.select().from(applicationStages).where(eq(applicationStages.id, stageId)).get()?.at

  it('once restored, it is an ordinary event: moving it leaves the stage alone, «У кошик» works', async () => {
    const { stageId, eventId, at } = await staleEvent()
    v.trash.restore({ type: 'event', id: eventId })
    await v.api.events.update({ id: eventId, patch: { startAt: Date.now() + 96 * HOUR } })
    expect(stageAt(stageId)).toBe(at)
    await expect(v.api.events.remove(eventId)).resolves.toBeUndefined()
  })

  it('startup housekeeping drops it from the trash; the events stages point at stay', async () => {
    const { eventId } = await staleEvent()
    const { stageId: liveStage } = await vacancyWithInterview(v)
    const [live] = stageEvents(v, liveStage)
    v.calendar.repo.softDelete(live.id)
    v.jobs.tidy()
    expect(v.trash.list().map((i) => i.id)).toEqual([live.id])
    expect(v.calendar.repo.row(eventId, true)).toBeUndefined()
  })
})

describe('«Видалити назавжди» from a stale trash list', () => {
  it('a record already restored elsewhere is not deleted', async () => {
    const b = await v.api.boards.create({ title: 'Жива' })
    await expect(v.trash.api(new EventBus()).purge({ type: 'board', id: b.id })).rejects.toThrow(
      /уже не в кошику/
    )
    expect(v.boards.listBoards().map((x) => x.id)).toEqual([b.id])
  })
})
