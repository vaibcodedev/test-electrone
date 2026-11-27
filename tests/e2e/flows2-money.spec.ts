import type { Locator, Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/**
 * Finance flows, round 2 (docs/quality-pass.md §6): a subscription → «paid» tick becomes this month's expense,
 * a different amount, untick; a withdrawal from a platform with a fee and a rate. Through the UI; RPC checks.
 */

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** Grouped digits in any locale space (regular, no-break, narrow no-break). */
const money = (int: string): RegExp =>
  new RegExp(int.replace(/(\d)(?=(\d{3})+$)/g, '$1[\\s\\u00a0\\u202f]?'))

const subsCard = (win: Page): Locator =>
  win.locator('[data-slot="card"]').filter({ has: win.getByText(/^Підписки на /) })

test.describe('фінанси: підписка → оплата', () => {
  test('«Додати підписку» → галочка «оплачено» стає витратою → інша сума → зняти позначку', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const title = `Хостинг ${uid()}`
    const month = currentMonth()
    const paidRow = async (): Promise<
      { expenseId: string | null; paidAmount: number | null } | undefined
    > =>
      (await rpc('finance.subscriptionMonth', { month })).find(
        (r: { title: string }) => r.title === title
      )

    await go('/finance/expenses')
    await subsCard(win).getByRole('button', { name: 'Додати підписку' }).first().click()
    const dialog = win.getByRole('dialog', { name: 'Нова підписка' })
    const submit = dialog.getByRole('button', { name: 'Додати підписку' })
    // Name and amount are required: the button waits for both.
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Назва').fill(title)
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Сума').fill('12')
    await dialog.getByLabel('Сума').blur()
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(win.getByText('Підписку додано').first()).toBeVisible()
    await expect(dialog).toBeHidden()

    const row = subsCard(win).getByRole('row').filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(row).toContainText(money('12'))
    expect((await paidRow())?.expenseId).toBeNull()

    // Tick → the subscription becomes this month's expense (a row in the expenses table too).
    await row.getByRole('checkbox', { name: /^Позначити .* оплаченою$/ }).click()
    await expect(row.getByRole('checkbox', { name: /^Зняти позначку оплати/ })).toBeChecked()
    await expect.poll(async () => (await paidRow())?.expenseId).toBeTruthy()
    await expect(win.getByRole('row').filter({ hasText: title })).toHaveCount(2)

    // Paid a different amount: the row says so.
    await row.getByRole('button', { name: 'Оплачено іншою сумою' }).click()
    const pop = win.locator('[data-slot="popover-content"]')
    const amount = pop.getByRole('textbox')
    await expect(amount).toBeFocused()
    await amount.fill('15')
    await pop.getByRole('button', { name: 'Позначити оплаченою' }).click()
    await expect(pop).toBeHidden()
    await expect(row).toContainText(/сплачено/)
    await expect.poll(async () => (await paidRow())?.paidAmount).toBe(15)

    // Untick → the expense is gone again.
    await row.getByRole('checkbox', { name: /^Зняти позначку оплати/ }).click()
    await expect(row.getByRole('checkbox', { name: /^Позначити .* оплаченою$/ })).not.toBeChecked()
    await expect.poll(async () => (await paidRow())?.expenseId).toBeNull()
    await expect(win.getByRole('row').filter({ hasText: title })).toHaveCount(1)

    // Delete asks first.
    await row.getByRole('button', { name: 'Видалити підписку' }).click()
    const ask = win.getByRole('alertdialog', { name: `Видалити підписку «${title}»?` })
    await ask.getByRole('button', { name: /Видалити/ }).click()
    await expect(win.getByText('Підписку видалено').first()).toBeVisible()
    await expect(row).toHaveCount(0)
  })
})

test.describe('фінанси: виведення', () => {
  test('«Додати виплату» з платформи: комісія й курс → «Надійде ≈» → рядок і менший баланс', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const method = `Payoneer ${uid()}`
    const balanceOf = async (id: string): Promise<number> =>
      (await rpc('finance.overview')).platformBalances.find(
        (b: { platformId: string }) => b.platformId === id
      )?.balance ?? 0
    const rich = (await rpc('finance.overview')).platformBalances
      .filter((b: { balance: number }) => b.balance > 0)
      .sort((a: { balance: number }, b: { balance: number }) => b.balance - a.balance)[0]
    test.skip(!rich || rich.balance < 10, 'seed has no platform with money on it')
    const amount = Math.min(10, Math.floor(rich.balance))
    const before = rich.balance

    await go('/finance/withdrawals')
    await win
      .locator('[data-slot="page-header"]')
      .getByRole('button', { name: 'Додати виплату' })
      .click()
    const dialog = win.getByRole('dialog', { name: 'Нова виплата' })
    const submit = dialog.getByRole('button', { name: 'Додати виплату' })
    // «Звідки» defaults to the platform with the most money.
    await expect(dialog.getByLabel('Звідки')).toContainText(rich.name)
    await expect(submit).toBeDisabled()

    await dialog.getByLabel('Сума', { exact: true }).fill(String(amount))
    // A fee above the amount is a typo: said at the field, the button stays off.
    await dialog.getByLabel('Комісія за виплату').fill(String(amount + 5))
    await dialog.getByLabel('Комісія за виплату').blur()
    await expect(dialog.getByText('Комісія більша за суму виплати')).toBeVisible()
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Комісія за виплату').fill('2')
    await dialog.getByLabel('Комісія за виплату').blur()
    await expect(dialog.getByText('Комісія більша за суму виплати')).toBeHidden()

    // USD → UAH: a new withdrawal never starts from a made-up rate 1 (last real rate or empty); 41 gives (amount − 2) × 41.
    const rate = dialog.getByLabel(/^Курс: 1 /)
    await expect(rate).not.toHaveValue('1')
    await rate.fill('41')
    await rate.blur()
    const received = (amount - 2) * 41
    await expect(dialog.getByText(/Надійде ≈/).locator('..')).toContainText(money(String(received)))
    await dialog.getByLabel('Спосіб').fill(method)
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(win.getByText('Виплату додано').first()).toBeVisible()
    await expect(dialog).toBeHidden()

    const row = win.getByRole('row').filter({ hasText: method })
    await expect(row).toBeVisible()
    await expect(row).toContainText(rich.name)
    await expect(row).toContainText(money(String(received)))
    await expect.poll(() => balanceOf(rich.platformId)).toBeCloseTo(before - amount, 2)
    const saved: { method: string; amount: number; received: number; fee: number; rate: number }[] =
      await rpc('finance.withdrawals', {})
    expect(saved.find((w) => w.method === method)).toMatchObject({
      amount,
      received,
      fee: 2,
      rate: 41
    })

    // Remove: asks, then the balance comes back.
    await row.getByRole('button', { name: 'Видалити виплату' }).click()
    await win
      .getByRole('alertdialog', { name: 'Видалити виплату?' })
      .getByRole('button', { name: /Видалити/ })
      .click()
    await expect(win.getByText('Виплату видалено').first()).toBeVisible()
    await expect(row).toHaveCount(0)
    await expect.poll(() => balanceOf(rich.platformId)).toBeCloseTo(before, 2)
  })
})
