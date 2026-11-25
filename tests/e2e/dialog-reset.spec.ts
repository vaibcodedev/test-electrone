import { expect, test, uid } from './fixtures'

/**
 * A create dialog or popover opens empty every time (docs/design-system.md → Сброс формы диалога): what was typed
 * and left by «Скасувати», Esc or a click outside doesn't come back, and neither do its errors.
 */

test('«Новий клієнт»: typed, «Скасувати», opened again — empty, no errors', async ({ vault }) => {
  const { win, go } = vault
  await go('/clients')
  const open = async (): Promise<void> =>
    win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Клієнт' }).click()
  const dialog = win.getByRole('dialog', { name: 'Новий клієнт' })
  const name = dialog.getByRole('textbox', { name: 'Ім’я або назва' })
  const email = dialog.getByRole('textbox', { name: 'Email' })

  await open()
  await name.fill(`Чернетка ${uid()}`)
  await email.fill('не пошта')
  await email.blur()
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  // The required name left empty says so too.
  await name.fill('')
  await name.blur()
  await expect(dialog.getByText('Заповніть це поле')).toBeVisible()
  await dialog.getByRole('button', { name: 'Скасувати' }).click()
  await expect(dialog).toBeHidden()

  await open()
  await expect(dialog).toBeVisible()
  await expect(name).toHaveValue('')
  await expect(email).toHaveValue('')
  await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0)
  await expect(dialog.getByText('Заповніть це поле')).toHaveCount(0)
  // Typed again and left with Esc: the next opening is empty as well.
  await name.fill('Ще одна чернетка')
  await win.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await open()
  await expect(name).toHaveValue('')
  await dialog.getByRole('button', { name: 'Скасувати' }).click()
})

test('«+ Вакансія» and «Нова подія»: left with Esc, they open empty', async ({ vault }) => {
  const { win, go } = vault
  await go('/jobs/applications')
  const header = win.locator('[data-slot="page-header"]')
  await header.getByRole('button', { name: 'Вакансія' }).click()
  const form = win.locator('[data-slot="popover-content"]')
  const title = form.getByPlaceholder('Middle Frontend Developer')
  await title.fill(`Посада ${uid()}`)
  await win.keyboard.press('Escape')
  await expect(form).toBeHidden()
  await header.getByRole('button', { name: 'Вакансія' }).click()
  await expect(title).toHaveValue('')
  await win.keyboard.press('Escape')

  await go('/calendar')
  await win.getByRole('button', { name: 'Подія', exact: true }).click()
  const event = win.getByRole('dialog', { name: 'Нова подія' })
  await event.getByLabel('Назва').fill(`Подія ${uid()}`)
  await win.keyboard.press('Escape')
  await expect(event).toBeHidden()
  await win.getByRole('button', { name: 'Подія', exact: true }).click()
  await expect(event.getByLabel('Назва')).toHaveValue('')
  await win.keyboard.press('Escape')
})
