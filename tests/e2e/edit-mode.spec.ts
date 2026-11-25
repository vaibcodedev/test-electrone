import type { Locator, Page } from '@playwright/test'
import { expect, test, uid, type Vault } from './fixtures'

/** View/edit mode of a record = a transaction (docs/design-system.md → Просмотр и редактирование). */

const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()
const titleField = (win: Page): Locator => win.getByRole('textbox', { name: 'Назва' })
const openParam = (win: Page): Promise<string | null> =>
  win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))

async function openIdeaInEdit(vault: Vault): Promise<{ id: string; title: string }> {
  const idea = await vault.rpc('ideas.create', { title: `Ідея ${uid()}` })
  await vault.go(`/ideas?open=${idea.id}`)
  await expect(pane(vault.win)).toHaveAttribute('data-detail-mode', 'view')
  // View mode: the title is a heading, not an input.
  await expect(vault.win.getByRole('heading', { name: idea.title })).toBeVisible()
  await expect(titleField(vault.win)).toHaveCount(0)
  await vault.win.locator('[data-edit-detail]').click()
  await expect(pane(vault.win)).toHaveAttribute('data-detail-mode', 'edit')
  return idea as { id: string; title: string }
}

test.describe('view → «Редагувати» → Esc → «Зберегти зміни?»', () => {
  test('«Не зберігати» reverts the title', async ({ vault }) => {
    const { win, rpc } = vault
    const idea = await openIdeaInEdit(vault)
    await titleField(win).fill('Змінена назва')
    await titleField(win).blur()
    await win.keyboard.press('Escape')

    const ask = win.getByRole('alertdialog', { name: 'Зберегти зміни?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Не зберігати' }).click()

    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('ideas.get', idea.id)).title).toBe(idea.title)
    await expect(win.getByRole('heading', { name: idea.title })).toBeVisible()
  })

  test('«Зберегти» in the dialog persists the title', async ({ vault }) => {
    const { win, rpc } = vault
    const idea = await openIdeaInEdit(vault)
    const next = `Збережена ${uid()}`
    await titleField(win).fill(next)
    await titleField(win).blur()
    await win.keyboard.press('Escape')

    const ask = win.getByRole('alertdialog', { name: 'Зберегти зміни?' })
    await ask.getByRole('button', { name: 'Зберегти' }).click()

    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('ideas.get', idea.id)).title).toBe(next)
    await expect(win.getByRole('heading', { name: next })).toBeVisible()
  })

  test('«Зберегти» button in the header persists the title without asking', async ({ vault }) => {
    const { win, rpc } = vault
    const idea = await openIdeaInEdit(vault)
    const next = `Кнопка ${uid()}`
    await titleField(win).fill(next)
    await win.locator('[data-save]').click()
    await expect(win.getByRole('alertdialog')).toHaveCount(0)
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('ideas.get', idea.id)).title).toBe(next)
  })

  test('«Скасувати» in the header reverts an existing record', async ({ vault }) => {
    const { win, rpc } = vault
    const idea = await openIdeaInEdit(vault)
    await titleField(win).fill('Тимчасово')
    await win.getByRole('button', { name: 'Скасувати' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('ideas.get', idea.id)).title).toBe(idea.title)
    expect(await rpc('ideas.get', idea.id)).not.toBeNull()
  })

  test('Esc without changes just leaves edit mode', async ({ vault }) => {
    const { win } = vault
    await openIdeaInEdit(vault)
    await win.keyboard.press('Escape')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect(win.getByRole('alertdialog')).toHaveCount(0)
  })

  // UX BUG: the global Esc handler ignores keys from inputs/textareas (use-global-shortcuts.ts isEditable),
  // and InlineTitle/Textarea don't handle Esc themselves — so Esc right after typing in a field does nothing;
  // the user has to click outside first. Esc never saves: it asks «Зберегти зміни?» (tooltip: «Зберегти й повернутися до перегляду»).
  test('Esc pressed while the title field still has focus asks «Зберегти зміни?»', async ({
    vault
  }) => {
    const { win } = vault
    await openIdeaInEdit(vault)
    await titleField(win).fill('Змінено з фокусом')
    await win.keyboard.press('Escape')
    await expect(win.getByRole('alertdialog', { name: 'Зберегти зміни?' })).toBeVisible({
      timeout: 3000
    })
  })
})

test.describe('«Скасувати» on a record created a moment ago', () => {
  test('a new note (draft) is not created at all', async ({ vault }) => {
    const { win, rpc, go } = vault
    await go('/notes')
    await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Нотатка' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const id = await openParam(win)
    expect(id).toBeTruthy()
    expect(await rpc('notes.get', id)).not.toBeNull()

    await win.getByRole('button', { name: 'Скасувати' }).click()
    await expect.poll(() => rpc('notes.get', id)).toBeNull()
    await expect.poll(() => openParam(win)).toBeNull()
  })

  test('a new note with a typed title is not created either', async ({ vault }) => {
    const { win, rpc, go } = vault
    await go('/notes')
    await win.locator('[data-slot="page-header"]').getByRole('button', { name: 'Нотатка' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const id = await openParam(win)
    await titleField(win).fill(`Чернетка ${uid()}`)
    await win.waitForTimeout(1200) // let the autosave reach the server
    await win.getByRole('button', { name: 'Скасувати' }).click()
    await expect.poll(() => rpc('notes.get', id)).toBeNull()
  })

  // Regression (was a bug): guide-page.tsx («Новий запис після «Скасувати» не створюється зовсім») and design-system.md promise that
  // «Скасувати» removes a just-created record. useRecordMode.cancel only calls trash.discardDraft, which deletes
  // nothing for types without a `draft` descriptor (ideas, proposals, boards…) or with a non-default title.
  test('a new idea from «Нова ідея…» is not created at all', async ({ vault }) => {
    const { win, rpc, go } = vault
    await go('/ideas')
    const title = `Нова з UI ${uid()}`
    await win.getByPlaceholder('Нова ідея…').fill(title)
    await win.getByRole('button', { name: 'Додати ідею' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const id = await openParam(win)
    expect(id).toBeTruthy()
    await win.getByRole('button', { name: 'Скасувати' }).click()
    await expect.poll(() => rpc('ideas.get', id), { timeout: 4000 }).toBeNull()
  })
})

test.describe('dialogs opened from a record in view mode', () => {
  test('proposal → «Контракт»: the dialog inputs are editable', async ({ vault }) => {
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

    await win.getByRole('button', { name: 'Контракт', exact: true }).click()
    const hire = win.getByRole('dialog', { name: 'Оформити контракт' })
    await expect(hire).toBeVisible()
    const name = hire.getByRole('textbox').first()
    await expect(name).toBeEditable()
    expect(await name.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(false)
    await name.fill('Контракт з e2e')
    await expect(name).toHaveValue('Контракт з e2e')
    await hire
      .getByRole('button', { name: /Скасувати|Закрити/ })
      .first()
      .click()
  })
})
