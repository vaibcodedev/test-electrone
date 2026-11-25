import type { Locator, Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/** The Markdown editor of every Markdown field (CodeMirror): the «/» menu, list keys, record-link chips. */

const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()
const textOf = (win: Page): Locator =>
  pane(win).getByRole('textbox', { name: 'Текст', exact: true })

test('«/» → «Чек-лист» starts a task list: Enter continues it, Enter on an empty item ends it', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const note = await rpc('notes.create', { title: `Слеш ${uid()}`, body: '' })
  await go(`/notes?open=${note.id}`)
  await win.locator('[data-edit-detail]').click()
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
  const text = textOf(win)
  await text.click()
  // The menu opens under the text: a pointer resting there would pick the row under it.
  await win.mouse.move(1, 1)

  // Esc closes the menu for this «/», not the record's edit mode; the «/» stays as typed.
  const menu = win.getByRole('listbox', { name: 'Блоки для вставки' })
  await win.keyboard.type('/')
  await expect(menu.getByRole('option')).toHaveCount(10)
  await win.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
  await expect(text).toBeFocused()
  await expect(text).toHaveText('/')
  await win.keyboard.press('Backspace')

  await win.keyboard.type('/чек')
  const todo = menu.getByRole('option', { name: /Чек-лист/ })
  await expect(menu.getByRole('option')).toHaveCount(1)
  await expect(todo).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await win.keyboard.type('Купити хліб')
  await win.keyboard.press('Enter')
  await win.keyboard.type('Молоко')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Enter')
  await win.keyboard.type('Готово')
  await expect
    .poll(async () => (await rpc('notes.get', note.id)).body)
    .toBe('- [ ] Купити хліб\n- [ ] Молоко\n\nГотово')

  await win.locator('[data-save]').click()
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
  await expect(pane(win).locator('.prose-vault input[type="checkbox"]')).toHaveCount(2)
})

test('a record link is one chip with the current title: Backspace removes it whole, Ctrl+Z brings it back', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const tag = uid()
  const target = await rpc('notes.create', { title: `Стара ${tag}`, body: '' })
  const body = `Див. [Стара ${tag}](vault:note/${target.id})`
  const source = await rpc('notes.create', { title: `Чип ${tag}`, body })
  // Renamed after the link was written: the chip shows the title it has now.
  await rpc('notes.update', { id: target.id, patch: { title: `Нова ${tag}` } })

  await go(`/notes?open=${source.id}`)
  await win.locator('[data-edit-detail]').click()
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
  const text = textOf(win)
  const chip = text.locator('[data-wikilink="live"]')
  await expect(chip).toHaveText(`Нова ${tag}`)
  await expect(text).toHaveText(`Див. Нова ${tag}`)
  await expect(text).not.toContainText('vault:')

  await text.click()
  await win.keyboard.press('Control+End')
  await win.keyboard.press('Backspace')
  await expect(chip).toHaveCount(0)
  await expect.poll(async () => (await rpc('notes.get', source.id)).body).toBe('Див. ')

  await win.keyboard.press('Control+z')
  await expect(chip).toHaveText(`Нова ${tag}`)
  await expect.poll(async () => (await rpc('notes.get', source.id)).body).toBe(body)
  // Back to the stored text: nothing to save, and Esc leaves without asking.
  await expect(win.locator('[data-save]')).toBeDisabled()
  await win.keyboard.press('Escape')
  await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
  await expect(win.getByRole('alertdialog')).toHaveCount(0)
})
