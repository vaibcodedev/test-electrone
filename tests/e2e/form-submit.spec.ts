import { expect, test, uid } from './fixtures'

/**
 * Every create / save form (docs/design-system.md → Формы): the submit is off while a required field is empty or a
 * field shows an error, Enter sends nothing then, and the reason is in the button's tooltip.
 */

test('«Нова подія» with an empty title: «Додати» off, Enter creates nothing, a title turns it on', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const title = `Подія ${uid()}`
  const count = async (): Promise<number> =>
    ((await rpc('events.list', { limit: 1000 })) as { title: string }[]).length
  const before = await count()
  await go('/calendar')
  await win.getByRole('button', { name: 'Подія', exact: true }).click()
  const dialog = win.getByRole('dialog', { name: 'Нова подія' })
  const name = dialog.getByLabel('Назва')
  const add = dialog.getByRole('button', { name: 'Додати', exact: true })
  await expect(name).toBeFocused()
  // Pristine: no red on open, but the button is already off and says why.
  await expect(add).toBeDisabled()
  await expect(name).not.toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.getByText('Заповніть це поле')).toHaveCount(0)
  await add.locator('xpath=..').focus()
  await expect(win.getByRole('tooltip')).toContainText('Заповніть: Назва')

  // Enter in the empty title: nothing is created, the field says what is missing.
  await name.focus()
  await win.keyboard.press('Enter')
  await expect(dialog.getByText('Заповніть це поле')).toBeVisible()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog).toBeVisible()
  expect(await count()).toBe(before)

  // Spaces are no title either.
  await name.fill('   ')
  await expect(add).toBeDisabled()

  await name.fill(title)
  await expect(add).toBeEnabled()
  await expect(name).not.toHaveAttribute('aria-invalid', 'true')
  await add.click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () =>
      ((await rpc('events.list', { limit: 1000 })) as { title: string }[]).some(
        (e) => e.title === title
      )
    )
    .toBe(true)
})

test('«Нова мітка»: «Додати» off while empty, Enter adds nothing, a name adds the tag', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const name = `мітка-${uid()}`
  const tags = async (): Promise<string[]> =>
    ((await rpc('tags.list')) as { name: string }[]).map((t) => t.name)
  const before = (await tags()).length
  await go('/tags')
  const field = win.getByRole('textbox', { name: 'Нова мітка' })
  const add = win.getByRole('button', { name: 'Додати', exact: true })
  await expect(add).toBeDisabled()
  await field.focus()
  await win.keyboard.press('Enter')
  await win.waitForTimeout(300)
  expect((await tags()).length).toBe(before)

  await field.fill(name)
  await expect(add).toBeEnabled()
  await field.press('Enter')
  await expect.poll(tags).toContain(name)
  await expect(field).toHaveValue('')
  await expect(add).toBeDisabled()
})
