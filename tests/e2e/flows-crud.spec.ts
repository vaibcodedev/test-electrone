import type { Locator, Page } from '@playwright/test'
import { expect, test, uid, type Vault } from './fixtures'

/**
 * Full record lifecycle through the UI (docs/quality-pass.md §6):
 * create → fill → save → find (page search, Ctrl+K, tag filter) → edit → «Скасувати» reverts →
 * to trash → restore from the trash page → to trash → delete for good.
 * RPC is used only to check what the UI did.
 */

const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()
const titleField = (win: Page): Locator => win.getByRole('textbox', { name: 'Назва' })
const openParam = (win: Page): Promise<string | null> =>
  win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))
const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])

/** Waits until no CSS animation runs in the window (sheet / dialog enter and exit). */
const waitAnimations = (win: Page): Promise<unknown> =>
  win.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === 'running' &&
            !(a.effect as KeyframeEffect | null)?.target?.closest?.('[aria-label="Таймер іде"]')
        ).length === 0
  )

/** Ctrl+K → type → pick the hit with this title → the app navigates to the record. */
async function findWithPalette(win: Page, text: string, title: string): Promise<void> {
  await win.keyboard.press('Control+k')
  const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
  await expect(palette).toBeVisible()
  await palette.getByPlaceholder('Знайти ідею, сніпет, помилку, клієнта…').fill(text)
  const hit = palette.getByRole('option', { name: new RegExp(title) }).first()
  await expect(hit).toBeVisible()
  await hit.click()
  await expect(palette).toBeHidden()
}

/** /trash: «Відновити» on the row with this title. */
async function restoreFromTrash(vault: Vault, title: string): Promise<void> {
  const { win, go } = vault
  await go('/trash')
  const row = win.locator('[data-slot="item"]').filter({ hasText: title })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Відновити' }).click()
  await expect(row).toHaveCount(0)
}

/** /trash: the bin icon on the row → «Видалити назавжди?» → «Видалити назавжди». */
async function purgeFromTrash(vault: Vault, title: string): Promise<void> {
  const { win, go } = vault
  await go('/trash')
  const row = win.locator('[data-slot="item"]').filter({ hasText: title })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Видалити назавжди' }).click()
  const ask = win.getByRole('alertdialog', { name: 'Видалити назавжди?' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Видалити назавжди', exact: true }).click()
  await expect(row).toHaveCount(0)
}

const inTrash = async (vault: Vault, id: string): Promise<boolean> =>
  (await vault.rpc('trash.list', { limit: 500 })).some((t: { id: string }) => t.id === id)

test.describe('ідея: повний цикл через інтерфейс', () => {
  test('створити → мітка → знайти → змінити й скасувати → кошик → відновити → назавжди', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = `fi${uid()}`
    const title = `Ідея ${token}`
    const tagName = `мітка-${token}`
    const other = await rpc('ideas.create', { title: `Сусідня ідея ${uid()}` })

    // Create: the quick input adds the idea and opens it for reading; «Редагувати» to fill it in.
    await go('/ideas')
    await win.getByPlaceholder('Нова ідея…').fill(title)
    await win.getByRole('button', { name: 'Додати ідею' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await pane(win).getByRole('button', { name: 'Редагувати' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const id = (await openParam(win))!
    expect(id).toBeTruthy()
    await expect(titleField(win)).toHaveValue(title)

    // Fill: description + a new tag created right from the picker.
    await pane(win).getByRole('textbox', { name: 'Опис' }).fill(`Опис ${token}`)
    await pane(win).getByRole('button', { name: 'Додати мітку' }).click()
    await win.getByPlaceholder('Знайти або створити…').fill(tagName)
    await win.getByRole('option', { name: `Створити «${tagName}»` }).click()
    await expect(pane(win).getByText(tagName)).toBeVisible()
    await win.keyboard.press('Escape') // closes the tag popover only
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')

    // Save.
    await pane(win).locator('[data-save]').click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect
      .poll(async () => {
        const i = await rpc('ideas.get', id)
        return [i.title, i.body, i.tags.map((t: { name: string }) => t.name)]
      })
      .toEqual([title, `Опис ${token}`, [tagName]])
    await expect(pane(win).getByText(`Опис ${token}`)).toBeVisible()

    // Close and find it again with the page search.
    await pane(win).getByRole('button', { name: 'Закрити' }).click()
    await expect(pane(win)).toHaveCount(0)
    await win.locator('[data-page-search]').fill(token)
    await expect(win.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    await expect(win.getByText(other.title)).toHaveCount(0)
    await win.locator('[data-page-search]').fill('')

    // Tag filter: only records with the tag stay.
    await expect(win.getByText(other.title)).toBeVisible()
    await win.getByRole('button', { name: 'Мітка', exact: true }).click()
    await win.getByRole('option', { name: new RegExp(tagName) }).click()
    await expect(win.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    await expect(win.getByText(other.title)).toHaveCount(0)
    await win.getByRole('button', { name: 'Скинути мітку' }).click()

    // Ctrl+K from another screen opens the record itself.
    await go('/')
    await findWithPalette(win, token, title)
    await expect.poll(() => hashPath(win)).toBe('/ideas')
    await expect.poll(() => openParam(win)).toBe(id)
    await expect(win.getByRole('heading', { name: title })).toBeVisible()

    // Edit, then «Скасувати» reverts both fields.
    await pane(win).locator('[data-edit-detail]').click()
    await titleField(win).fill(`Змінена ${token}`)
    await pane(win).getByRole('radio', { name: 'Текст' }).click()
    await pane(win).getByRole('textbox', { name: 'Опис' }).fill('Інший опис')
    // Let the autosave land first (cancelling right after typing is covered by flows-shortcuts).
    await expect.poll(async () => (await rpc('ideas.get', id)).body).toBe('Інший опис')
    await pane(win).getByRole('button', { name: 'Скасувати' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect(win.getByRole('heading', { name: title })).toBeVisible()
    await expect
      .poll(async () => {
        const i = await rpc('ideas.get', id)
        return [i.title, i.body]
      })
      .toEqual([title, `Опис ${token}`])

    // To the trash from the pane; the list no longer shows it.
    await pane(win).getByRole('button', { name: 'У кошик' }).click()
    await expect(pane(win)).toHaveCount(0)
    await expect.poll(() => inTrash(vault, id)).toBe(true)
    expect(await rpc('ideas.get', id)).toBeNull()

    await restoreFromTrash(vault, title)
    await expect.poll(async () => (await rpc('ideas.get', id))?.title).toBe(title)
    // Restored with its tag.
    expect((await rpc('ideas.get', id)).tags.map((t: { name: string }) => t.name)).toEqual([
      tagName
    ])

    await rpc('ideas.remove', id)
    await purgeFromTrash(vault, title)
    await expect.poll(() => inTrash(vault, id)).toBe(false)
    expect(await rpc('ideas.get', id)).toBeNull()
    expect(
      (await rpc('search.query', { text: token })).map((h: { id: string }) => h.id)
    ).not.toContain(id)
  })
})

test.describe('нотатка: повний цикл через інтерфейс', () => {
  test('«Нотатка» → назва й текст → знайти → змінити й скасувати → кошик → відновити → назавжди', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = `fn${uid()}`
    const title = `Нотатка ${token}`

    await go('/notes')
    await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Нотатка' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const id = (await openParam(win))!
    await titleField(win).fill(title)
    await pane(win)
      .getByRole('textbox', { name: 'Текст', exact: true })
      .fill(`Текст ${token} про домовленості`)
    await pane(win).locator('[data-save]').click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect
      .poll(async () => {
        const n = await rpc('notes.get', id)
        return [n?.title, n?.body]
      })
      .toEqual([title, `Текст ${token} про домовленості`])

    // Not a draft any more: closing keeps it.
    await pane(win).getByRole('button', { name: 'Закрити' }).click()
    await expect(pane(win)).toHaveCount(0)
    await win.waitForTimeout(1200) // the pane's draft cleanup runs 800 ms after closing
    expect(await rpc('notes.get', id)).not.toBeNull()

    // Search by a word from the body.
    await win.locator('[data-page-search]').fill(`${token} про`)
    const row = win.getByRole('button', { name: new RegExp(title) })
    await expect(row).toBeVisible()
    await row.click()
    await expect.poll(() => openParam(win)).toBe(id)

    // Edit and cancel.
    await pane(win).locator('[data-edit-detail]').click()
    await titleField(win).fill('Тимчасова назва')
    await expect.poll(async () => (await rpc('notes.get', id)).title).toBe('Тимчасова назва')
    await pane(win).getByRole('button', { name: 'Скасувати' }).click()
    await expect(win.getByRole('heading', { name: title })).toBeVisible()
    await expect.poll(async () => (await rpc('notes.get', id)).title).toBe(title)

    // Trash → restore → trash → purge.
    await pane(win).getByRole('button', { name: 'У кошик' }).click()
    await expect.poll(() => inTrash(vault, id)).toBe(true)
    await restoreFromTrash(vault, title)
    await expect.poll(async () => (await rpc('notes.get', id))?.title).toBe(title)
    await go(`/notes?open=${id}`)
    await pane(win).getByRole('button', { name: 'У кошик' }).click()
    await expect.poll(() => inTrash(vault, id)).toBe(true)
    await purgeFromTrash(vault, title)
    await expect.poll(() => inTrash(vault, id)).toBe(false)
  })
})

test.describe('«У кошик» і одразу інший запис', () => {
  test('поки панель іде, відкрита друга нотатка лишається відкритою й у фокусі', async ({ vault }) => {
    const { win, rpc, go } = vault
    const token = `tr${uid()}`
    const a = await rpc('notes.create', { title: `Перша ${token}`, body: 'А' })
    const b = await rpc('notes.create', { title: `Друга ${token}`, body: 'Б' })

    await go(`/notes?open=${a.id}`)
    await win.locator('[data-page-search]').fill(token)
    await expect(win.getByRole('button', { name: new RegExp(`Друга ${token}`) })).toBeVisible()
    await expect(pane(win).getByRole('heading', { name: `Перша ${token}` })).toBeVisible()

    // Both clicks in one task: B is opened well inside the pane's 0.2 s fade-out, as a quick person does it.
    await win.evaluate((title) => {
      const pane = document.querySelector('[data-detail-mode]')!
      pane.querySelector<HTMLButtonElement>('button[aria-label="У кошик"]')!.click()
      const row = [...document.querySelectorAll<HTMLButtonElement>('[data-index] button')].find((r) =>
        r.textContent?.includes(title)
      )!
      row.focus()
      row.click()
    }, `Друга ${token}`)

    await expect.poll(() => inTrash(vault, a.id)).toBe(true)
    await win.waitForTimeout(800) // past the delayed close and the pane's unmount
    expect(await openParam(win)).toBe(b.id)
    await expect(pane(win).getByRole('heading', { name: `Друга ${token}` })).toBeVisible()
    // The trashed pane's refocus doesn't move focus off the row that was clicked.
    expect(await win.evaluate(() => document.activeElement?.textContent ?? '')).toContain(`Друга ${token}`)
  })
})

test.describe('вакансія: повний цикл через інтерфейс', () => {
  test('«Вакансія» → посада → зберегти → знайти → скасувати правку → кошик → відновити → назавжди', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = `fv${uid()}`
    const title = `Frontend ${token}`

    await go('/jobs/applications')
    await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Вакансія' }).click()
    const form = win.locator('[data-slot="popover-content"]')
    await form.getByPlaceholder('Middle Frontend Developer').fill(title)
    await form.getByRole('button', { name: 'Додати й відкрити' }).click()

    const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
    await expect(sheet.locator('[data-detail-mode]').first()).toHaveAttribute(
      'data-detail-mode',
      'edit'
    )
    const id = (await openParam(win))!
    expect(id).toBeTruthy()
    await expect(titleField(win)).toHaveValue(title)
    await sheet.locator('[data-save]').click()
    await expect(sheet.locator('[data-detail-mode]').first()).toHaveAttribute(
      'data-detail-mode',
      'view'
    )
    expect((await rpc('jobs.get', id)).title).toBe(title)

    await sheet.getByRole('button', { name: 'Закрити' }).click()
    // Let the close animation finish: reopening during it is a separate bug (see below).
    await expect(win.locator('[data-slot="sheet-content"]')).toHaveCount(0)
    await win.locator('[data-page-search]').fill(token)
    await expect(win.getByText(title).first()).toBeVisible()
    await win.getByText(title).first().click()
    await expect.poll(() => openParam(win)).toBe(id)

    // Edit, cancel → the title comes back.
    await sheet.locator('[data-edit-detail]').click()
    await titleField(win).fill(`Інша посада ${token}`)
    await expect.poll(async () => (await rpc('jobs.get', id)).title).toBe(`Інша посада ${token}`)
    await sheet.getByRole('button', { name: 'Скасувати' }).click()
    await expect(sheet.locator('[data-detail-mode]').first()).toHaveAttribute(
      'data-detail-mode',
      'view'
    )
    await expect.poll(async () => (await rpc('jobs.get', id)).title).toBe(title)

    // «У кошик» asks first.
    await sheet.getByRole('button', { name: 'У кошик' }).click()
    const ask = win.getByRole('alertdialog', { name: 'Видалити вакансію?' })
    await ask.getByRole('button', { name: 'У кошик' }).click()
    await expect.poll(() => inTrash(vault, id)).toBe(true)

    await restoreFromTrash(vault, title)
    await expect.poll(async () => (await rpc('jobs.get', id))?.title).toBe(title)
    await rpc('jobs.remove', id)
    await purgeFromTrash(vault, title)
    await expect.poll(() => inTrash(vault, id)).toBe(false)
  })
})

test.describe('клієнт і проєкт: повний цикл через інтерфейс', () => {
  test('клієнт → проєкт для нього → знайти → скасувати правку → кошик → відновити → назавжди', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = `fc${uid()}`
    const clientName = `Клієнт ${token}`
    const projectTitle = `Проєкт ${token}`

    // Client through its dialog → the client page opens.
    await go('/clients')
    await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Клієнт' }).click()
    const cd = win.getByRole('dialog', { name: 'Новий клієнт' })
    await cd.getByRole('textbox').first().fill(clientName)
    await cd.getByRole('button', { name: 'Додати клієнта' }).click()
    await expect(cd).toBeHidden()
    await expect.poll(() => hashPath(win)).toMatch(/^\/clients\/.+/)
    const clientId = (await hashPath(win)).split('/').pop()!
    expect((await rpc('clients.get', clientId)).name).toBe(clientName)

    // Project through the lime «Проєкт» → its page.
    await go('/clients')
    await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Проєкт' }).click()
    const pd = win.getByRole('dialog', { name: 'Новий проєкт' })
    await pd.getByPlaceholder('Напр.: Редизайн магазину').fill(projectTitle)
    await pd.getByRole('combobox').first().click()
    await win.getByRole('option', { name: new RegExp(clientName) }).click()
    await pd.getByRole('button', { name: 'Створити проєкт' }).click()
    await expect(pd).toBeHidden()
    await expect.poll(() => hashPath(win)).toMatch(/^\/projects\/.+/)
    const projectId = (await hashPath(win)).split('/').pop()!
    const project = await rpc('projects.get', projectId)
    expect(project.title).toBe(projectTitle)
    expect(project.clientId).toBe(clientId)

    // A just-created project opens in edit mode with the name from the dialog; «Зберегти» confirms it.
    await expect(titleField(win)).toHaveValue(projectTitle)
    await win.locator('[data-save]').first().click()
    await expect(win.getByRole('heading', { name: projectTitle })).toBeVisible()

    // Find it on the projects tab.
    await go('/clients?tab=projects')
    await win.locator('[data-page-search]').fill(token)
    await expect(win.getByText(projectTitle).first()).toBeVisible()
    await win.getByText(projectTitle).first().click()
    await expect.poll(() => hashPath(win)).toBe(`/projects/${projectId}`)

    // Edit and cancel.
    await win.locator('[data-edit-detail]').click()
    await titleField(win).fill('Тимчасова назва проєкту')
    await expect
      .poll(async () => (await rpc('projects.get', projectId)).title)
      .toBe('Тимчасова назва проєкту')
    await win.getByRole('button', { name: 'Скасувати' }).click()
    await expect(win.locator('[data-detail-mode]').first()).toHaveAttribute(
      'data-detail-mode',
      'view'
    )
    await expect.poll(async () => (await rpc('projects.get', projectId)).title).toBe(projectTitle)

    // Delete (confirm) → the projects list; then restore and purge.
    await win.getByRole('button', { name: 'У кошик' }).click()
    await win
      .getByRole('alertdialog', { name: 'Видалити проєкт?' })
      .getByRole('button', { name: 'У кошик' })
      .click()
    await expect.poll(() => hashPath(win)).toBe('/clients')
    await expect.poll(() => inTrash(vault, projectId)).toBe(true)

    await restoreFromTrash(vault, projectTitle)
    await expect.poll(async () => (await rpc('projects.get', projectId))?.title).toBe(projectTitle)
    await rpc('projects.remove', projectId)
    await purgeFromTrash(vault, projectTitle)
    await expect.poll(() => inTrash(vault, projectId)).toBe(false)
    // The client stays.
    expect((await rpc('clients.get', clientId))?.name).toBe(clientName)
  })
})

test.describe('регресії флоу', () => {
  // A sheet reopened while its close animation still runs re-mounts its overlay after the content (separate
  // Radix portals); the overlay sits one z-layer lower, so the next click still reaches the sheet.
  test('a vacancy reopened right after closing stays clickable', async ({ vault }) => {
    const { win, rpc, go } = vault
    const a = await rpc('jobs.create', { title: `Швидко ${uid()}` })
    await go(`/jobs/applications?open=${a.id}`)
    const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
    await expect(sheet.locator('[data-edit-detail]')).toBeVisible()
    await waitAnimations(win)
    await sheet.getByRole('button', { name: 'Закрити' }).click()
    await win.getByText(a.title).first().click()
    await expect(sheet.locator('[data-edit-detail]')).toBeVisible()
    await sheet.locator('[data-edit-detail]').click({ timeout: 5000 })
    await expect(sheet.locator('[data-detail-mode]').first()).toHaveAttribute(
      'data-detail-mode',
      'edit'
    )
  })

  // docs/design-system.md → «Только что созданная запись открывается сразу в редактировании». The one-shot flag
  // used to be eaten by a render React threw away while `projects.details` loaded (about two of three times),
  // so five creations in a row must all open in edit mode.
  test('a project created from the dialog opens in edit mode', async ({ vault }) => {
    test.setTimeout(60_000)
    const { win, go } = vault
    const modes: (string | null)[] = []
    for (let i = 0; i < 5; i++) {
      await go('/clients')
      await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Проєкт' }).click()
      const pd = win.getByRole('dialog', { name: 'Новий проєкт' })
      await pd.getByPlaceholder('Напр.: Редизайн магазину').fill(`Новий ${uid()}`)
      await pd.getByRole('button', { name: 'Створити проєкт' }).click()
      await expect(pd).toBeHidden()
      const mode = win.locator('[data-detail-mode]').first()
      await expect(mode).toBeVisible()
      await waitAnimations(win)
      modes.push(await mode.getAttribute('data-detail-mode'))
    }
    expect(modes).toEqual(['edit', 'edit', 'edit', 'edit', 'edit'])
  })
})
