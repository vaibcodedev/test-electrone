import type { Locator, Page } from '@playwright/test'
import { expect, test, uid, type Vault } from './fixtures'

/**
 * Vault's own right-click menu for text (features/text-menu + main/system/text-menu.ts). What it must prove:
 * opening it and choosing a row never loses focus, caret or selection — in an input inside a sheet (Radix focus
 * trap), a textarea that closes when left, the Markdown editor and the code editor (CodeMirror) — and it never
 * shows up together with a record's own menu.
 */

const menu = (win: Page): Locator => win.locator('[data-text-menu]')
const item = (win: Page, label: string): Locator =>
  menu(win)
    .getByRole('menuitem')
    .filter({ has: win.locator('span.truncate', { hasText: new RegExp(`^${label}$`) }) })

const readClipboard = (vault: Vault): Promise<string> =>
  vault.app.evaluate(({ clipboard }) => clipboard.readText())
const writeClipboard = (vault: Vault, text: string): Promise<void> =>
  vault.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)

const fieldSelection = (field: Locator): Promise<[number | null, number | null]> =>
  field.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])
const pageSelection = (win: Page): Promise<string> =>
  win.evaluate(() => window.getSelection()?.toString() ?? '')

/**
 * Right click in the middle of the selected text (Chromium keeps a selection a right click lands on); the menu
 * hangs from the pointer.
 */
async function rightClickSelection(win: Page): Promise<void> {
  const at = await win.evaluate(() => {
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await win.mouse.click(at.x, at.y, { button: 'right' })
  await expect(menu(win)).toBeVisible()
  const box = (await menu(win).boundingBox())!
  expect(Math.abs(box.x - at.x)).toBeLessThan(8)
  expect(Math.abs(box.y - at.y)).toBeLessThan(8)
}

/** Clicks a row, then moves the pointer over the fading menu: its rows must not take focus back meanwhile. */
async function choose(win: Page, label: string): Promise<void> {
  const box = (await menu(win).boundingBox())!
  await item(win, label).click()
  await win.mouse.move(box.x + 24, box.y + 12)
  await win.mouse.move(box.x + 40, box.y + box.height - 12, { steps: 4 })
  await expect(menu(win)).toHaveCount(0)
}

test('an input in a sheet: Shift+F10 and Esc give focus and the selection back; cut, copy, paste keep the caret', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const platforms = await rpc('platforms.list')
  const title = `Меню ${uid()}`
  const proposal = await rpc('proposals.create', {
    platformId: platforms[0].id,
    jobTitle: title,
    bidAmount: 100,
    feePercent: 10
  })
  await go(`/freelance/proposal/${proposal.id}`)
  const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
  const mode = sheet.locator('[data-detail-mode]').first()
  await sheet.locator('[data-edit-detail]').click()
  await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
  await win.mouse.move(1, 1)
  const name = sheet.getByRole('textbox', { name: 'Назва' })
  await name.fill('Перший другий')
  await name.evaluate((el: HTMLInputElement) => el.setSelectionRange(7, 13))

  // From the keyboard: the first row has focus; Esc closes only the menu, not the sheet's edit mode.
  await win.keyboard.press('Shift+F10')
  await expect(menu(win)).toBeVisible()
  await expect(item(win, 'Вирізати')).toBeFocused()
  await expect(item(win, 'Вставити')).toBeEnabled()
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)
  await expect(name).toBeFocused()
  expect(await fieldSelection(name)).toEqual([7, 13])
  await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
  await expect(win.getByRole('alertdialog')).toHaveCount(0)
  // The Menu key does the same.
  await win.keyboard.press('ContextMenu')
  await expect(item(win, 'Вирізати')).toBeFocused()
  await win.keyboard.press('Escape')
  await expect(name).toBeFocused()
  expect(await fieldSelection(name)).toEqual([7, 13])

  // Down to «Копіювати» and Enter: the selected word is copied, the selection stays.
  await win.keyboard.press('Shift+F10')
  await expect(item(win, 'Вирізати')).toBeFocused()
  await win.keyboard.press('ArrowDown')
  await expect(item(win, 'Копіювати')).toBeFocused()
  await win.keyboard.press('Enter')
  await expect(menu(win)).toHaveCount(0)
  await expect.poll(() => readClipboard(vault)).toBe('другий')
  await expect(name).toBeFocused()
  expect(await fieldSelection(name)).toEqual([7, 13])

  // With the mouse, on the selected text: cut, then paste puts it back with the caret after it.
  await win.keyboard.press('Control+A')
  await name.click({ button: 'right', position: { x: 30, y: 10 } })
  await choose(win, 'Вирізати')
  await expect(name).toHaveValue('')
  await expect(name).toBeFocused()
  await name.click({ button: 'right', position: { x: 30, y: 10 } })
  await expect(item(win, 'Копіювати')).toBeDisabled()
  await choose(win, 'Вставити')
  await expect(name).toHaveValue('Перший другий')
  await expect(name).toBeFocused()
  expect(await fieldSelection(name)).toEqual([13, 13])
  // A right click on another field while the menu is open: the menu moves there, and so does focus (the
  // commands act on the focused field).
  const fee = sheet.getByRole('textbox', { name: 'Комісія платформи' })
  // Measured first: an open menu hides the page from the accessibility tree, and getByRole with it.
  const feeBox = (await fee.boundingBox())!
  await name.click({ button: 'right', position: { x: 30, y: 10 } })
  await expect(menu(win)).toBeVisible()
  await win.waitForTimeout(150)
  const feeY = feeBox.y + feeBox.height / 2
  await win.mouse.click(feeBox.x + 20, feeY, { button: 'right' })
  await expect
    .poll(async () => Math.abs(((await menu(win).boundingBox())?.y ?? -100) - feeY))
    .toBeLessThan(8)
  await expect(menu(win)).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)
  await expect(fee).toBeFocused()

  // The sheet never noticed: still editing, the autosave has the pasted text.
  await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
  await expect.poll(async () => (await rpc('proposals.get', proposal.id)).jobTitle).toBe('Перший другий')
})

test('a textarea that closes when left stays open; a card keeps its own menu, never both', async ({ vault }) => {
  const { win, rpc, go } = vault
  const board = await rpc('boards.create', { title: `Меню ${uid()}` })
  const { columns } = await rpc('boards.details', board.id)
  const cardTitle = `Картка ${uid()}`
  await rpc('cards.create', { boardId: board.id, columnId: columns[0].id, title: cardTitle })
  try {
    await go(`/boards/${board.id}`)

    // A card: only the record's menu (it calls preventDefault, Chromium asks main nothing).
    await win.getByText(cardTitle).click({ button: 'right' })
    await expect(win.getByRole('menuitem', { name: 'Відкрити' })).toBeVisible()
    await win.waitForTimeout(300)
    await expect(menu(win)).toHaveCount(0)
    await expect(win.getByRole('menu')).toHaveCount(1)
    await win.keyboard.press('Escape')
    await expect(win.getByRole('menu')).toHaveCount(0)

    // A field inside a record's trigger (none today; a later record menu may have one): the text menu wins.
    const tile = win.locator('[data-context-menu-trigger]').filter({ hasText: cardTitle })
    await tile.evaluate((el) => {
      const input = document.createElement('input')
      input.setAttribute('data-probe', '')
      input.value = 'поле в картці'
      el.appendChild(input)
    })
    const probe = win.locator('input[data-probe]')
    await probe.click({ button: 'right' })
    await expect(menu(win)).toBeVisible()
    await expect(win.getByRole('menu')).toHaveCount(1)
    await win.keyboard.press('Escape')
    await expect(menu(win)).toHaveCount(0)
    await probe.evaluate((el) => el.remove())

    // The empty quick-add field closes on blur: the menu must not count as leaving it.
    await writeClipboard(vault, 'Нова з меню')
    await win.getByRole('button', { name: 'Додати картку' }).first().click()
    const field = win.getByRole('textbox', { name: 'Назва нової картки' })
    await expect(field).toBeFocused()
    await field.click({ button: 'right' })
    await expect(menu(win)).toBeVisible()
    await expect(win.getByRole('menu')).toHaveCount(1)
    // Not by role: the open menu hides the rest of the page from assistive tech (aria-hidden), as any menu.
    await expect(win.locator('textarea[aria-label="Назва нової картки"]')).toBeVisible()
    await expect(item(win, 'Вирізати')).toBeDisabled()
    await expect(item(win, 'Копіювати')).toBeDisabled()
    await choose(win, 'Вставити')
    await expect(field).toHaveValue('Нова з меню')
    await expect(field).toBeFocused()

    // A click outside closes the menu and nothing else: the field keeps focus and its text.
    await field.click({ button: 'right' })
    await expect(menu(win)).toBeVisible()
    // Radix starts listening for presses outside a tick after the menu appears (no person is that quick).
    await win.waitForTimeout(150)
    await win.mouse.click(5, 450)
    await expect(menu(win)).toHaveCount(0)
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('Нова з меню')
  } finally {
    await rpc('boards.remove', board.id)
  }
})

test('the Markdown editor: copy, cut, paste and select all keep its selection and focus', async ({ vault }) => {
  const { win, rpc, go } = vault
  const note = await rpc('notes.create', { title: `Меню ${uid()}`, body: '' })
  await go(`/notes?open=${note.id}`)
  const pane = win.locator('[data-detail-mode]').first()
  await win.locator('[data-edit-detail]').click()
  await expect(pane).toHaveAttribute('data-detail-mode', 'edit')
  const text = pane.getByRole('textbox', { name: 'Текст', exact: true })
  await text.click()
  await win.keyboard.type('Привіт світ')
  for (let i = 0; i < 4; i++) await win.keyboard.press('Shift+ArrowLeft')
  expect(await pageSelection(win)).toBe('світ')

  await rightClickSelection(win)
  await expect(menu(win)).toBeVisible()
  await choose(win, 'Копіювати')
  await expect.poll(() => readClipboard(vault)).toBe('світ')
  await expect(text).toBeFocused()
  expect(await pageSelection(win)).toBe('світ')

  await rightClickSelection(win)
  await choose(win, 'Вирізати')
  await expect(text).toHaveText('Привіт ')
  await expect(text).toBeFocused()
  await win.keyboard.type('!')
  await expect(text).toHaveText('Привіт !')
  await win.keyboard.press('Backspace')

  // A separate step in the editor's history (typing within 0.5 s would join it).
  await win.waitForTimeout(600)
  await text.click({ button: 'right' })
  await choose(win, 'Вставити')
  await expect(text).toHaveText('Привіт світ')
  await expect(text).toBeFocused()

  await text.click({ button: 'right' })
  await choose(win, 'Виділити все')
  await expect(text).toBeFocused()
  expect(await pageSelection(win)).toBe('Привіт світ')
  // The editor's own undo history: Ctrl+Z takes back the paste.
  await win.keyboard.press('End')
  await win.keyboard.press('Control+Z')
  await expect(text).toHaveText('Привіт')
  await expect.poll(async () => (await rpc('notes.get', note.id)).body).toBe('Привіт ')
  await expect(pane).toHaveAttribute('data-detail-mode', 'edit')
})

test('the code editor: paste goes in at the caret', async ({ vault }) => {
  const { win, rpc, go } = vault
  const snippet = await rpc('snippets.create', { title: `Меню ${uid()}`, code: 'const a = 1' })
  await go(`/snippets?open=${snippet.id}`)
  const pane = win.locator('[data-detail-mode]').first()
  await win.locator('[data-edit-detail]').click()
  await expect(pane).toHaveAttribute('data-detail-mode', 'edit')
  const code = pane.locator('.cm-content')
  await code.click()
  await win.keyboard.press('Control+End')
  await writeClipboard(vault, '\nconst b = 2')
  await code.click({ button: 'right' })
  await expect(menu(win)).toBeVisible()
  await choose(win, 'Вставити')
  await expect(code).toBeFocused()
  await expect.poll(async () => (await rpc('snippets.get', snippet.id)).code).toBe('const a = 1\nconst b = 2')
})

test('a password field offers neither cut nor copy; Esc leaves it as it was', async ({ vault }) => {
  const { win, go } = vault
  await go('/settings#ai')
  const key = win.locator('#ai').getByLabel('Ключ Google Gemini')
  await key.fill('секрет-ключ')
  await writeClipboard(vault, 'чисто')
  await key.press('Control+A')
  await key.click({ button: 'right', position: { x: 30, y: 10 } })
  await expect(menu(win)).toBeVisible()
  await expect(item(win, 'Вирізати')).toBeDisabled()
  await expect(item(win, 'Копіювати')).toBeDisabled()
  await expect(item(win, 'Вставити')).toBeEnabled()
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)
  await expect(key).toBeFocused()
  await expect(key).toHaveValue('секрет-ключ')
  expect(await readClipboard(vault)).toBe('чисто')
  await key.fill('')
})

test('read-only text: a code block, a link and selected words; nothing to offer — no menu', async ({ vault }) => {
  const { win, rpc, go } = vault
  const body = 'Див. [документацію](https://example.com/docs) і словом.\n\n```js\nconst answer = 42\n```'
  const note = await rpc('notes.create', { title: `Меню ${uid()}`, body })
  await go(`/notes?open=${note.id}`)
  const prose = win.locator('[data-detail-mode] .prose-vault').first()
  await expect(prose).toBeVisible()

  await prose.locator('pre').click({ button: 'right' })
  await expect(item(win, 'Копіювати')).toBeDisabled()
  await choose(win, 'Копіювати весь блок')
  await expect.poll(async () => (await readClipboard(vault)).trim()).toBe('const answer = 42')

  await prose.getByRole('link', { name: 'документацію' }).click({ button: 'right' })
  await expect(item(win, 'Відкрити в браузері')).toBeVisible()
  await choose(win, 'Копіювати адресу')
  await expect.poll(() => readClipboard(vault)).toBe('https://example.com/docs')

  await prose.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      const at = node.data.indexOf('словом')
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + 'словом'.length)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      return
    }
  })
  await rightClickSelection(win)
  await choose(win, 'Копіювати')
  await expect.poll(() => readClipboard(vault)).toBe('словом')
  expect(await pageSelection(win)).toBe('словом')

  // The title with nothing selected: Chromium asks, the menu has nothing to offer and doesn't open.
  await win.evaluate(() => window.getSelection()?.removeAllRanges())
  await win.getByRole('heading', { name: note.title }).click({ button: 'right' })
  await win.waitForTimeout(400)
  await expect(menu(win)).toHaveCount(0)
})
