import type { Locator, Page } from '@playwright/test'
import { expect, test, uid, type Vault } from './fixtures'

/** «Шаблони»: «Для чого», own situations and the two-step filter on the built app. */

const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()
const save = (win: Page): Locator => win.locator('[data-save]')

async function openInEdit(
  vault: Vault,
  input: Record<string, unknown>
): Promise<{ id: string; title: string; purpose: string; situation: string }> {
  const t = await vault.rpc('templates.create', { title: `Шаблон ${uid()}`, body: 'Hi {client}', ...input })
  await vault.go(`/freelance/templates?open=${t.id}`)
  await expect(pane(vault.win)).toHaveAttribute('data-detail-mode', 'view')
  await vault.win.locator('[data-edit-detail]').click()
  await expect(pane(vault.win)).toHaveAttribute('data-detail-mode', 'edit')
  await expect(save(vault.win)).toBeDisabled()
  return t
}

async function pickPurpose(win: Page, label: string): Promise<void> {
  await win.getByRole('combobox', { name: 'Для чого' }).click()
  await win.getByRole('option', { name: label }).click()
}

test.describe('template record: «Для чого» and the situation are edits like any field', () => {
  test('only «Для чого» changed: «Зберегти» turns on and saves it', async ({ vault }) => {
    const { win, rpc } = vault
    const t = await openInEdit(vault, { situation: 'proposal' })
    expect(t.purpose).toBe('freelance')
    await pickPurpose(win, 'Вакансії')
    await expect(save(win)).toBeEnabled()
    await save(win).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('templates.get', t.id)).purpose).toBe('jobs')
    // While reading it is the coloured label.
    await expect(pane(win).locator('[data-purpose="jobs"]')).toBeVisible()
  })

  test('only «Для чого» changed, then «Скасувати»: the old value is back', async ({ vault }) => {
    const { win, rpc } = vault
    const t = await openInEdit(vault, { situation: 'cover_letter' })
    await pickPurpose(win, 'Будь-де')
    await expect(save(win)).toBeEnabled()
    await expect.poll(async () => (await rpc('templates.get', t.id)).purpose).toBe('any')
    await win.getByRole('button', { name: 'Скасувати' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('templates.get', t.id)).purpose).toBe('jobs')
  })

  test('only the situation changed — to a built-in one, then to a new own one; «Скасувати» restores', async ({
    vault
  }) => {
    const { win, rpc } = vault
    const t = await openInEdit(vault, { situation: 'proposal' })
    const field = win.locator(`#situation-${t.id}`)
    await field.click()
    await win.getByRole('option', { name: 'Нагадування' }).click()
    await expect(save(win)).toBeEnabled()
    await expect.poll(async () => (await rpc('templates.get', t.id)).situation).toBe('follow_up')

    const own = `Привітання HR ${uid()}`
    await field.click()
    await win.keyboard.type(own)
    await win.getByRole('option', { name: `Створити «${own}»` }).click()
    await expect.poll(async () => (await rpc('templates.get', t.id)).situation).toBe(own)
    await expect(save(win)).toBeEnabled()
    // «Для чого» is never changed by a new situation.
    expect((await rpc('templates.get', t.id)).purpose).toBe('freelance')

    await win.getByRole('button', { name: 'Скасувати' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('templates.get', t.id)).situation).toBe('proposal')
  })

  test('a new own situation is saved by «Зберегти» and offered as a chip', async ({ vault }) => {
    const { win, rpc } = vault
    const t = await openInEdit(vault, { situation: 'other', purpose: 'jobs' })
    const own = `Відповідь на відмову ${uid()}`
    await win.locator(`#situation-${t.id}`).click()
    await win.keyboard.type(own)
    await win.getByRole('option', { name: `Створити «${own}»` }).click()
    await expect(save(win)).toBeEnabled()
    await save(win).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    expect((await rpc('templates.get', t.id)).situation).toBe(own)
    await expect(
      win.getByRole('radiogroup', { name: 'Ситуація' }).getByRole('radio', { name: new RegExp(`^${own}`) })
    ).toBeVisible()
  })
})

test('the direction switch filters the list and drops a situation it has no templates for', async ({ vault }) => {
  const { win } = vault
  const tag = uid()
  await vault.rpc('templates.create', { title: `Лист ${tag}`, situation: 'cover_letter' })
  await vault.rpc('templates.create', { title: `Відгук ${tag}`, situation: 'proposal' })
  await vault.rpc('templates.create', { title: `Нагадування ${tag}`, situation: 'follow_up' })
  await vault.go('/freelance/templates?situation=cover_letter')
  const list = win
  await expect(list.getByText(`Лист ${tag}`)).toBeVisible()

  const directions = win.getByLabel('Для чого', { exact: true })
  await directions.locator('button', { hasText: /^Фриланс/ }).click()
  await expect
    .poll(() => win.evaluate(() => decodeURIComponent(location.hash)))
    .toBe('#/freelance/templates?purpose=freelance')
  await win.getByPlaceholder('Шукати в шаблонах').fill(tag)
  await expect(list.getByText(`Відгук ${tag}`)).toBeVisible()
  await expect(list.getByText(`Нагадування ${tag}`)).toBeVisible()
  await expect(list.getByText(`Лист ${tag}`)).toHaveCount(0)

  await directions.locator('button', { hasText: /^Вакансії/ }).click()
  await expect(list.getByText(`Лист ${tag}`)).toBeVisible()
  await expect(list.getByText(`Нагадування ${tag}`)).toBeVisible()
  await expect(list.getByText(`Відгук ${tag}`)).toHaveCount(0)
})

test('text versions: add one, save, switch while reading, copy the chosen one', async ({ vault }) => {
  const { win, rpc } = vault
  const t = await openInEdit(vault, { situation: 'first_message', body: 'Hi {client}!' })
  await win.getByRole('button', { name: 'Версія', exact: true }).click()
  const versions = win.getByRole('radiogroup', { name: 'Версія тексту' })
  await expect(versions.getByRole('radio', { name: 'Українська' })).toBeChecked()
  const text = win.getByRole('textbox', { name: 'Текст' })
  await expect(text).toHaveValue('')
  await text.fill('Вітаю, {client}!')
  await expect(save(win)).toBeEnabled()
  await save(win).click()
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
  await expect
    .poll(async () => (await rpc('templates.get', t.id)).versions)
    .toEqual([{ name: 'Українська', body: 'Вітаю, {client}!' }])
  expect((await rpc('templates.get', t.id)).body).toBe('Hi {client}!')

  // Reading: the switch stays and shows each version's own text.
  await versions.getByRole('radio', { name: 'Основна' }).click()
  await expect(pane(win).getByText('Hi {client}!')).toBeVisible()
  await versions.getByRole('radio', { name: 'Українська' }).click()
  await expect(pane(win).getByText('Вітаю, {client}!')).toBeVisible()

  // «Скопіювати» starts on the shown version and lets you pick another.
  await pane(win).getByRole('button', { name: 'Скопіювати' }).click()
  const dialog = win.getByRole('dialog', { name: 'Скопіювати шаблон' })
  await dialog.locator('#var-client').fill('Анна')
  await expect(dialog.locator('#template-filled')).toHaveValue('Вітаю, Анна!')
  await dialog.getByRole('radiogroup', { name: 'Версія' }).getByRole('radio', { name: 'Основна' }).click()
  await expect(dialog.locator('#template-filled')).toHaveValue('Hi Анна!')
  await dialog.getByRole('button', { name: 'Скопіювати текст' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await rpc('templates.get', t.id)).copyCount).toBe(1)
  // The list row names the versions.
  await expect(win.getByText('Основна · Українська')).toBeVisible()
})
