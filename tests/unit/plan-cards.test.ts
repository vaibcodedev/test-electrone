import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { linkPlanTasks, planTasks } from '@shared/plan-tasks'
import { WeeklyReviewService } from '@main/services/weekly-review-service'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const PLAN = [
  'Головне:',
  '- [ ] Написати тести',
  '- [x] Уже зроблено',
  '  1. [ ] **Оновити** [документацію](https://example.com)',
  '- [ ]   ',
  '```',
  '- [ ] приклад у коді',
  '```',
  '- [ ] [Стара](vault:card/abc)'
].join('\n')

describe('planTasks', () => {
  it('takes unchecked lines without a card, as plain titles', () => {
    expect(planTasks(PLAN).map((t) => [t.line, t.title])).toEqual([
      [1, 'Написати тести'],
      [3, 'Оновити документацію']
    ])
  })

  it('links used lines, which then are not offered again', () => {
    const next = linkPlanTasks(PLAN, [
      { line: 1, cardId: 'c1' },
      { line: 3, cardId: 'c2' }
    ]).split('\n')
    expect(next[1]).toBe('- [ ] [Написати тести](vault:card/c1)')
    expect(next[3]).toBe(
      '  1. [ ] **Оновити** [документацію](https://example.com) → [Оновити документацію](vault:card/c2)'
    )
    expect(planTasks(next.join('\n'))).toEqual([])
  })
})

describe('review.createCards', () => {
  let v: Vault
  let review: ReturnType<WeeklyReviewService['api']>
  beforeEach(() => {
    v = openVault()
    // Cards and notes need only the boards module of the service's dependencies.
    review = new WeeklyReviewService(v.db, { boards: v.boards } as never).api()
  })
  afterEach(() => v.close())

  const weekStart = '2026-11-23'
  const setup = async () => {
    const board = await v.api.boards.create({ title: 'Дошка' })
    const column = (await v.api.boards.details(board.id))!.columns[0]
    await review.saveNotes({ weekStart, plan: PLAN })
    return { board, column }
  }
  const storedPlan = async () =>
    (v.db.sqlite.prepare('SELECT plan FROM weekly_reviews').get() as { plan: string }).plan
  const cardsOf = async (id: string) => (await v.api.boards.details(id))!.cards

  it('creates the chosen cards once', async () => {
    const { board, column } = await setup()
    const input = {
      weekStart,
      columnId: column.id,
      tasks: [{ line: 1, text: 'Написати тести' }]
    }
    expect(await review.createCards(input)).toEqual({ boardId: board.id, count: 1 })
    const [card] = await cardsOf(board.id)
    expect(card.title).toBe('Написати тести')
    expect(await storedPlan()).toContain(`[Написати тести](vault:card/${card.id})`)
    await expect(review.createCards(input)).rejects.toThrow('План змінився')
    expect(await cardsOf(board.id)).toHaveLength(1)
  })

  it('creates nothing when the board is in the trash', async () => {
    const { board, column } = await setup()
    await v.api.boards.remove(board.id)
    await expect(
      review.createCards({
        weekStart,
        columnId: column.id,
        tasks: [{ line: 1, text: 'Написати тести' }]
      })
    ).rejects.toThrow()
    expect(await storedPlan()).toBe(PLAN)
  })
})
