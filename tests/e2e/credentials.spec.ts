import { expect, test, uid } from './fixtures'

/**
 * Доступи за типами (план.md §16): a server access through the UI → its main line and the SSH command → «+ Оплата»
 * makes a subscription in Фінанси › Підписки with a link back; the client page lists the project's access under its
 * project. RPC checks where the UI can't see (the clipboard, the stored link).
 */
test.describe('доступи: сервер → команда SSH → оплата', () => {
  test('«Додати доступ» → «Сервер» → рядок user@host:port і команда SSH → «Оплата» → підписка у Фінансах', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go, app } = vault
    const token = uid()
    const label = `VPS ${token}`
    const host = `vps-${token}.example.com`
    const client = await rpc('clients.create', { name: `Клієнт ${token}` })
    const project = await rpc('projects.create', { title: `Сайт ${token}`, clientId: client.id })

    await go(`/projects/${project.id}`)
    await win.getByRole('button', { name: 'Додати доступ' }).click()
    const form = win.locator('[data-credential-form]')
    const submit = form.getByRole('button', { name: 'Додати доступ' })
    // The kind comes first: without it there are no fields and nothing to add.
    await expect(submit).toBeDisabled()
    await form.locator('[data-kind="server"]').click()
    // Name and host are the server's minimum (requiredOf).
    await form.getByLabel('Назва', { exact: true }).fill(label)
    await expect(submit).toBeDisabled()
    await form.getByLabel('Хост або IP', { exact: true }).fill(host)
    await form.getByLabel('Порт', { exact: true }).fill('2222')
    await form.getByLabel('Користувач', { exact: true }).fill('root')
    await form.getByLabel('Пароль', { exact: true }).fill(`pw-${token}`)
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(win.getByText('Доступ додано').first()).toBeVisible()

    const card = win.locator('[data-credential="server"]').filter({ hasText: label })
    await expect(card.locator('[data-credential-line]')).toHaveText(`root@${host}:2222`)
    // The password never comes to the page: dots until «Показати».
    await expect(card).not.toContainText(`pw-${token}`)

    await card.getByRole('button', { name: 'Скопіювати команду SSH' }).click()
    await expect(win.getByText('Команду SSH скопійовано').first()).toBeVisible()
    const copied = await app.evaluate(async ({ clipboard }) => clipboard.readText())
    expect(copied).toBe(`ssh -p 2222 root@${host}`)

    // «+ Оплата» → a new subscription made from the access: its name comes along.
    await card.getByRole('button', { name: 'Оплата' }).click()
    await win.getByRole('menuitem', { name: 'Нова підписка…' }).click()
    const dialog = win.getByRole('dialog', { name: 'Нова підписка' })
    await expect(dialog.getByLabel('Назва', { exact: true })).toHaveValue(label)
    await dialog.getByLabel('Сума').fill('12')
    await dialog.getByLabel('Сума').blur()
    await dialog.getByRole('button', { name: 'Додати підписку' }).click()
    await expect(dialog).toBeHidden()
    await expect(card.locator('[data-credential-payment]')).toContainText(/12.*\/ міс/)

    const subs = await rpc('finance.subscriptions')
    const sub = subs.find((s: { title: string }) => s.title === label)
    expect(sub?.ownExpense).toBe(true)
    expect(sub?.credential?.owner).toEqual({ type: 'project', id: project.id })

    // The client page shows the project's access under its project (stored once, with its owner).
    await win.keyboard.press('Escape')
    await go(`/clients/${client.id}`)
    await expect(
      win.locator(`[data-credential-group="${project.id}"]`).getByText(label)
    ).toBeVisible()

    // Фінанси › Підписки: the row and its way back to the access.
    await go('/finance/expenses')
    const row = win.getByRole('row').filter({ hasText: label })
    await expect(row.first()).toBeVisible()
    await row
      .first()
      .getByRole('button', { name: `Доступ «${label}»` })
      .click()
    await expect(win).toHaveURL(new RegExp(`/projects/${project.id}`))
  })
})
