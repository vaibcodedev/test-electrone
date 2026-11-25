/** English words on a real database: the stage filter in SQL agrees with stageOf. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { stageOf } from '@main/core/srs'
import { words } from '@main/db/schema'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('word stage filter runs in SQL and matches stageOf', () => {
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
