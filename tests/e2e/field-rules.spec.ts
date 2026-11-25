import type { Locator } from '@playwright/test'
import { expect, test, uid, type Vault } from './fixtures'

/**
 * Field rules in the real form (docs/design-system.md → Лимиты полей): number fields refuse keys that can never
 * fit, «Відгуків на вакансію» is a choice of Upwork's buckets.
 */

async function openProposalInEdit(vault: Vault): Promise<{ id: string; sheet: Locator }> {
  const { win, rpc, go } = vault
  const platforms = await rpc('platforms.list')
  const proposal = await rpc('proposals.create', {
    platformId: platforms[0].id,
    jobTitle: `Відгук ${uid()}`,
    bidAmount: 300
  })
  await go(`/freelance/proposal/${proposal.id}`)
  const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
  await expect(sheet.locator('[data-detail-mode]').first()).toHaveAttribute(
    'data-detail-mode',
    'view'
  )
  await sheet.locator('[data-edit-detail]').first().click()
  await expect(sheet.locator('[data-detail-mode]').first()).toHaveAttribute(
    'data-detail-mode',
    'edit'
  )
  return { id: proposal.id, sheet }
}

test.describe('number fields take only what fits', () => {
  test('«Витрачено»: 24 typed digits stop at what fits 100 000 000', async ({ vault }) => {
    const { id, sheet } = await openProposalInEdit(vault)
    const spent = sheet.getByLabel('Витрачено', { exact: true })
    await spent.click()
    await spent.pressSequentially('424242424242424242424242')
    await expect(spent).toHaveValue('42424242')
    await spent.press('Tab')
    await expect
      .poll(async () => (await vault.rpc('proposals.get', id)).clientSpent)
      .toBe(42_424_242)
  })

  test('«Рейтинг» refuses 5.1, 4.99 and letters, takes 4,8', async ({ vault }) => {
    const { id, sheet } = await openProposalInEdit(vault)
    const rating = sheet.getByLabel('Рейтинг', { exact: true })
    await rating.click()
    await rating.pressSequentially('5.1')
    await expect(rating).toHaveValue('5.')
    await rating.fill('')
    await rating.pressSequentially('4.99')
    await expect(rating).toHaveValue('4.9')
    await rating.fill('')
    await rating.pressSequentially('abc-0')
    await expect(rating).toHaveValue('')
    await rating.pressSequentially('4,8')
    await expect(rating).toHaveValue('4,8')
    await rating.press('Tab')
    await expect.poll(async () => (await vault.rpc('proposals.get', id)).clientRating).toBe(4.8)

    // «Найм» is a whole percent up to 100.
    const hire = sheet.getByLabel('Найм', { exact: true })
    await hire.click()
    await hire.pressSequentially('42,4')
    // «,» is refused in a whole-number field, «424» is past 100.
    await expect(hire).toHaveValue('42')
  })
})

test('«Відгуків на вакансію» is a choice of Upwork buckets', async ({ vault }) => {
  const { id, sheet } = await openProposalInEdit(vault)
  const count = sheet.getByLabel('Відгуків на вакансію', { exact: true })
  await expect(count).toHaveAttribute('role', 'combobox')
  await count.click()
  for (const name of ['Менше 5', '5–10', '10–15', '15–20', '20–50', '50+'])
    await expect(vault.win.getByRole('option', { name, exact: true })).toBeVisible()
  await vault.win.getByRole('option', { name: '20–50', exact: true }).click()
  await expect(count).toHaveText(/20–50/)
  await expect.poll(async () => (await vault.rpc('proposals.get', id)).proposalsOnJob).toBe('20–50')
  // Free text is refused by the server too.
  const raw = await vault.rpcRaw('proposals.update', { id, patch: { proposalsOnJob: '4242ыаыа' } })
  expect(raw.ok).toBe(false)
})
