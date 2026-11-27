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

  // Esc asks main whether anything changed. A page left before the answer came still got the question — over the
  // next page, its answers acting on a record nobody saw any more (it blocked the next e2e test's clicks).
  test('Esc, then leaving the page before the answer: no question over the next page', async ({
    vault
  }) => {
    const { win } = vault
    await openIdeaInEdit(vault)
    await titleField(win).fill(`Пішли ${uid()}`)
    // Esc in the field and away in the same moment, as the next step of a script (or a quick hand) does.
    await titleField(win).evaluate((el) => {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
      location.hash = '#/'
    })
    await expect.poll(() => win.evaluate(() => location.hash)).toBe('#/')
    await win.waitForTimeout(1500)
    await expect(win.getByRole('alertdialog')).toHaveCount(0)
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

  // «Нова ідея…» + Enter is the save itself: the idea opens for reading with «Ідею додано», not in «Редагувати»
  // with «Зберегти / Скасувати» — that made a created idea look like an unsaved draft.
  test('a new idea from «Нова ідея…» is added at once and opens for reading', async ({ vault }) => {
    const { win, rpc, go } = vault
    await go('/ideas')
    const title = `Нова з UI ${uid()}`
    await win.getByPlaceholder('Нова ідея…').fill(title)
    await win.getByRole('button', { name: 'Додати ідею' }).click()
    await expect(
      win.locator('[data-sonner-toast]').filter({ hasText: 'Ідею додано' })
    ).toBeVisible()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    const id = await openParam(win)
    expect((await rpc('ideas.get', id))?.title).toBe(title)
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

/**
 * «Зберегти» is off until something changes and while a field shows an error; an invalid value never reaches main,
 * and leaving without saving brings back the stored values (docs/design-system.md → Просмотр и редактирование).
 */
test.describe('«Зберегти» waits for a change and for valid fields', () => {
  test('idea: off right after «Редагувати», on after typing, off again when the text is back', async ({
    vault
  }) => {
    const { win, rpc } = vault
    const idea = await openIdeaInEdit(vault)
    const save = win.locator('[data-save]')
    await expect(save).toBeDisabled()
    await titleField(win).fill(`${idea.title} змінено`)
    await expect(save).toBeEnabled()
    await expect
      .poll(async () => (await rpc('ideas.get', idea.id)).title)
      .toBe(`${idea.title} змінено`)
    // Typed back: the server says nothing differs from «Редагувати».
    await titleField(win).fill(idea.title)
    await expect.poll(async () => (await rpc('ideas.get', idea.id)).title).toBe(idea.title)
    await expect(save).toBeDisabled()
    await win.keyboard.press('Escape')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect(win.getByRole('alertdialog')).toHaveCount(0)
  })

  test('proposal: a number out of range turns «Зберегти» off, nothing is saved, «Не зберігати» restores', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const platforms = await rpc('platforms.list')
    const title = `Відгук ${uid()}`
    const proposal = await rpc('proposals.create', {
      platformId: platforms[0].id,
      jobTitle: title,
      bidAmount: 300,
      feePercent: 10
    })
    await go(`/freelance/proposal/${proposal.id}`)
    const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
    const mode = sheet.locator('[data-detail-mode]').first()
    await expect(mode).toHaveAttribute('data-detail-mode', 'view')
    await sheet.locator('[data-edit-detail]').click()
    await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
    // The pointer stays where «Редагувати» was — over «Зберегти» now: its tooltip would take the Esc below.
    await win.mouse.move(1, 1)

    const save = sheet.locator('[data-save]')
    await expect(save).toBeDisabled()
    const name = sheet.getByRole('textbox', { name: 'Назва' })
    await name.fill(`${title} новий`)
    await expect(save).toBeEnabled()
    await expect
      .poll(async () => (await rpc('proposals.get', proposal.id)).jobTitle)
      .toBe(`${title} новий`)

    // Out of range: the field says so, «Зберегти» goes off and explains why on focus.
    const fee = sheet.getByRole('textbox', { name: 'Комісія платформи' })
    // Typing can't reach 150 in a 0–100 field (the keys are refused); a paste can, and then the field says so.
    await fee.evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '150')
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }))
    })
    await expect(fee).toHaveAttribute('aria-invalid', 'true')
    await expect(save).toBeDisabled()
    await save.locator('xpath=..').focus()
    await expect(win.getByRole('tooltip')).toContainText('Виправте поля з помилками')
    // Typed while the error is shown: held back, not autosaved.
    await name.fill(`${title} поки помилка`)
    await win.waitForTimeout(1200)
    const stored = await rpc('proposals.get', proposal.id)
    expect(stored.feePercent).toBe(10)
    expect(stored.jobTitle).toBe(`${title} новий`)

    // Esc asks; «Зберегти» there is off for the same reason, «Не зберігати» reverts everything.
    await fee.focus()
    await expect(win.getByRole('tooltip')).toHaveCount(0)
    await win.keyboard.press('Escape')
    const ask = win.getByRole('alertdialog', { name: 'Зберегти зміни?' })
    await expect(ask).toBeVisible()
    await expect(ask).toContainText('Виправте поля з помилками')
    await expect(ask.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    await ask.getByRole('button', { name: 'Не зберігати' }).click()
    await expect(mode).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('proposals.get', proposal.id)).jobTitle).toBe(title)
    expect((await rpc('proposals.get', proposal.id)).feePercent).toBe(10)

    // The next «Редагувати» shows the stored values, not the abandoned text.
    await sheet.locator('[data-edit-detail]').click()
    await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
    await expect(sheet.getByRole('textbox', { name: 'Назва' })).toHaveValue(title)
    await expect(sheet.getByRole('textbox', { name: 'Комісія платформи' })).toHaveValue('10')
    await expect(sheet.getByRole('textbox', { name: 'Комісія платформи' })).not.toHaveAttribute(
      'aria-invalid',
      'true'
    )
    await expect(save).toBeDisabled()
  })
})

test.describe('Markdown «Перегляд»', () => {
  test('a 20 000-character word: bounded height, no sideways scroll, folded while reading', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const word = 'ж'.repeat(20_000)
    const note = await rpc('notes.create', { title: `Довге слово ${uid()}`, body: word })
    await go(`/notes?open=${note.id}`)
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    const noSideways = async (el: Locator): Promise<void> => {
      const { scroll, client } = await el.evaluate((n) => ({
        scroll: n.scrollWidth,
        client: n.clientWidth
      }))
      expect(scroll).toBeLessThanOrEqual(client + 1)
    }
    const body = pane(win).locator('[data-detail-body]')
    // Reading: folded under «Показати повністю», the word wraps.
    const prose = pane(win).locator('.prose-vault').first()
    await expect(pane(win).getByRole('button', { name: 'Показати повністю' })).toBeVisible()
    expect((await prose.boundingBox())!.width).toBeLessThan(1440)
    await noSideways(body)

    await win.locator('[data-edit-detail]').click()
    await pane(win).getByRole('radio', { name: 'Перегляд' }).click()
    const preview = pane(win).locator('[data-md-preview]')
    await expect(preview).toBeVisible()
    const box = (await preview.boundingBox())!
    // min(50vh, 26rem) of a 900px window = 416px.
    expect(box.height).toBeLessThanOrEqual(417)
    const scrolls = await preview.evaluate((n) => n.scrollHeight > n.clientHeight)
    expect(scrolls).toBe(true)
    await noSideways(preview)
    await noSideways(body)
    await win.keyboard.press('Escape')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
  })
})
