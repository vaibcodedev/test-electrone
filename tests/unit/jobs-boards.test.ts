/** Job boards on a real database: the daily habit grid and deleting a board. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dayKey } from '@main/core/util'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

describe('job board daily grid', () => {
  it('days before the board was created are not missed days', async () => {
    const board = await v.api.jobs.createBoard({ name: 'Djinni', weekdays: EVERY_DAY })
    const [row] = (await v.api.jobs.daily({ days: 28 })).filter((b) => b.id === board.id)
    expect(row.history).toHaveLength(28)
    expect(row.history.filter((h) => h.expected).map((h) => h.day)).toEqual([dayKey(Date.now())])
    expect(row.today.expected).toBe(true)
  })
})

describe('removing a job board', () => {
  it('a board nobody used yet is deleted', async () => {
    const board = await v.api.jobs.createBoard({ name: 'Опечатка' })
    await v.api.jobs.removeBoard(board.id)
    expect((await v.api.jobs.boards({ includeInactive: true })).map((b) => b.id)).not.toContain(
      board.id
    )
  })

  it('a board with applications or check-ins is kept: switch it off instead', async () => {
    const used = await v.api.jobs.createBoard({ name: 'DOU' })
    await v.api.jobs.create({ title: 'Frontend', boardId: used.id })
    await expect(v.api.jobs.removeBoard(used.id)).rejects.toThrow(/вимкніть його/)

    const checked = await v.api.jobs.createBoard({ name: 'LinkedIn' })
    await v.api.jobs.checkin({ boardId: checked.id, day: dayKey(Date.now()), checked: true })
    await expect(v.api.jobs.removeBoard(checked.id)).rejects.toThrow(/вимкніть його/)
  })

  it('the refusal names what keeps the board: vacancies (in the trash too) or day marks', async () => {
    const used = await v.api.jobs.createBoard({ name: 'Djinni' })
    const vacancy = await v.api.jobs.create({ title: 'Frontend', boardId: used.id })
    await v.api.jobs.remove(vacancy.id)
    await expect(v.api.jobs.removeBoard(used.id)).rejects.toThrow(
      /вже є вакансії \(можливо, у кошику\)/
    )

    const checked = await v.api.jobs.createBoard({ name: 'LinkedIn' })
    await v.api.jobs.checkin({ boardId: checked.id, day: dayKey(Date.now()), checked: true })
    await expect(v.api.jobs.removeBoard(checked.id)).rejects.toThrow(/позначки днів/)
  })
})
