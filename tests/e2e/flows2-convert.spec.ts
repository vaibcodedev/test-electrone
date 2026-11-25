import type { Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/**
 * Conversions, round 2 — what flows-work.spec.ts does not cover: an hourly contract from a proposal (rate, fee,
 * «На руки»), the proposal then links to it instead of offering a second one; the «Розібрати ідею» card carries
 * the idea's text and the idea moves to «in progress». Through the UI; RPC prepares and checks.
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const hashParam = (win: Page, name: string): Promise<string | null> =>
  win.evaluate((n) => new URLSearchParams(location.hash.split('?')[1] ?? '').get(n), name)

test.describe('конвертації: деталі', () => {
  test('відгук → «Контракт» «Погодинно» → ставка й комісія → проєкт погодинний; у відгуку «Відкрити контракт»', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const token = `hc${uid()}`
    const platforms = await rpc('platforms.list')
    const proposal = await rpc('proposals.create', {
      platformId: platforms[0].id,
      jobTitle: `Підтримка ${token}`,
      bidAmount: 500,
      clientName: `Агенція ${token}`
    })
    await go(`/freelance/proposal/${proposal.id}`)
    await win.getByRole('button', { name: 'Контракт', exact: true }).click()
    const hire = win.getByRole('dialog', { name: 'Оформити контракт' })
    const submit = hire.getByRole('button', { name: 'Створити контракт' })

    // The title is required: the button waits, and the field says so once it is left empty.
    const title = hire.getByRole('textbox').first()
    await title.fill('')
    await expect(submit).toBeDisabled()
    await title.blur()
    await expect(hire.getByText('Заповніть це поле')).toBeVisible()
    await title.fill(`Підтримка ${token}`)

    await hire.getByRole('radio', { name: 'Погодинно' }).click()
    const rate = hire.getByLabel('Ставка за годину')
    await rate.fill('40')
    await rate.blur()
    const fee = hire.getByLabel('Комісія платформи')
    await fee.fill('10')
    await fee.blur()
    await expect(hire.getByText(/На руки за годину/)).toContainText('36')
    await submit.click()
    await expect(win.getByText('Контракт створено').first()).toBeVisible()
    await expect.poll(() => hashPath(win)).toMatch(/^\/projects\/.+/)
    const projectId = (await hashPath(win)).split('/').pop()!

    const project = await rpc('projects.get', projectId)
    expect(project).toMatchObject({ billing: 'hourly', rate: 40, feePercent: 10 })
    const after = await rpc('proposals.get', proposal.id)
    expect(after).toMatchObject({ status: 'hired', projectId, clientId: project.clientId })

    // Back on the proposal: a link to the contract, not a second «Контракт».
    await go(`/freelance/proposal/${proposal.id}`)
    await expect(win.getByRole('button', { name: 'Контракт', exact: true })).toHaveCount(0)
    await win.getByRole('button', { name: 'Відкрити контракт' }).click()
    await expect.poll(() => hashPath(win)).toBe(`/projects/${projectId}`)
  })

  test('ідея → дошка: картка «Розібрати ідею» з текстом ідеї; ідея «в роботі»; дошка в списку', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const token = uid()
    const body = `Перевірити попит ${token}\nЗібрати 5 інтерв’ю`
    const idea = await rpc('ideas.create', { title: `Сервіс ${token}`, body })
    await go(`/ideas?open=${idea.id}`)
    await win.getByRole('button', { name: 'Перетворити на дошку' }).click()
    await expect(win.getByText('Дошку створено').first()).toBeVisible()
    await expect.poll(() => hashPath(win)).toMatch(/^\/boards\/.+/)
    const boardId = (await hashPath(win)).split('/').pop()!

    // The card opens in the side sheet with the idea's text.
    await win.getByText(`Розібрати ідею: ${idea.title}`).click()
    await expect.poll(() => hashParam(win, 'card')).toBeTruthy()
    const sheet = win.getByRole('dialog').filter({ hasText: `Розібрати ідею: ${idea.title}` })
    await expect(sheet).toContainText(`Перевірити попит ${token}`)
    await win.keyboard.press('Escape')
    await expect.poll(() => hashParam(win, 'card')).toBeNull()

    const converted = await rpc('ideas.get', idea.id)
    expect(converted).toMatchObject({ boardId, status: 'in_progress' })
    const board = await rpc('boards.get', boardId)
    expect(board.title).toBe(idea.title)
    expect(board.description).toBe(body)

    await go('/boards')
    const tile = win.locator('[data-slot="card"]').filter({ hasText: idea.title })
    await expect(tile.first()).toBeVisible()
    await tile.first().click()
    await expect.poll(() => hashPath(win)).toBe(`/boards/${boardId}`)
  })
})
