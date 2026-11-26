import type { Locator, Page } from '@playwright/test'
import { expect, test, uid, type Vault } from './fixtures'

/**
 * The record menu (features/record-menu): one declaration per kind of record, two ways to open it — a right
 * click on the record and its «⋯». Same items both ways, keyboard (Shift+F10, Enter on «⋯»), submenus with
 * the current value checked, «У кошик» with «Скасувати» and focus moving to the next row.
 */

const menu = (win: Page): Locator => win.locator('[data-record-menu-content]')
const item = (win: Page, label: string): Locator =>
  win
    .getByRole('menuitem', { name: label, exact: true })
    .or(win.getByRole('menuitemcheckbox', { name: label, exact: true }))
const area = (win: Page, title: string): Locator =>
  win.locator('[data-record-menu]').filter({ hasText: title })
const readClipboard = (vault: Vault): Promise<string> =>
  vault.app.evaluate(({ clipboard }) => clipboard.readText())

async function labels(win: Page): Promise<string[]> {
  const rows = menu(win).locator(':scope > [role="menuitem"], :scope > [role="separator"]')
  const all = await rows.evaluateAll((els) =>
    els.map((e) => (e.getAttribute('role') === 'separator' ? '—' : (e.textContent ?? '').trim()))
  )
  // «Мітки» shows only when the base has tags at all (other tests of the worker create some).
  return all.filter((l) => l !== 'Мітки')
}

test('ideas: right click and «⋯» give the same menu; status submenu, keyboard, copy link', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const title = `Меню ідеї ${uid()}`
  const idea = await rpc('ideas.create', { title })
  await go('/ideas')
  const row = area(win, title)
  await expect(row).toBeVisible()

  // Right click: the menu hangs from the pointer, in the fixed order of groups.
  const box = (await row.boundingBox())!
  await win.mouse.click(box.x + 40, box.y + 20, { button: 'right' })
  await expect(menu(win)).toBeVisible()
  const viaRightClick = await labels(win)
  expect(viaRightClick).toEqual([
    'Відкрити',
    'Перетворити на дошку',
    '—',
    'Статус',
    'Важливість',
    '—',
    'Закріпити',
    'В обране',
    'Копіювати посилання',
    '—',
    'У кошик'
  ])
  const menuBox = (await menu(win).boundingBox())!
  expect(Math.abs(menuBox.x - (box.x + 40))).toBeLessThan(12)

  // The status submenu marks the current one; the pointer going diagonally to a lower item keeps it open.
  const statusRow = item(win, 'Статус')
  await statusRow.hover()
  const sub = win.getByRole('menu', { name: 'Статус' })
  await expect(sub).toBeVisible()
  await expect(win.getByRole('menuitemcheckbox', { name: 'Вхідні' })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  const from = (await statusRow.boundingBox())!
  const target = (await win.getByRole('menuitemcheckbox', { name: 'Зроблено' }).boundingBox())!
  await win.mouse.move(from.x + from.width - 12, from.y + from.height / 2)
  // Across the «Важливість» row on the way: Radix's pointer grace keeps the submenu.
  await win.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 })
  await expect(sub).toBeVisible()
  await win.getByRole('menuitemcheckbox', { name: 'Зроблено' }).click()
  await expect(menu(win)).toHaveCount(0)
  await expect.poll(async () => (await rpc('ideas.get', idea.id)).status).toBe('done')
  // The list shows it (the status chips above may change their row meanwhile and move the list).
  await expect(row.getByText('Зроблено', { exact: true })).toBeVisible()
  await win.waitForTimeout(300)

  // «⋯»: hidden until the row is hovered or focused, named after the record, the same items.
  const more = row.getByRole('button', { name: `Дії: ${title}` })
  // Focus went back to the row after the choice: shown for the keyboard. Off the row, it hides.
  await expect(more).toHaveCSS('opacity', '1')
  await win.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await win.mouse.move(1, 1)
  await expect(more).toHaveCSS('opacity', '0')
  await row.hover()
  await expect(more).toHaveCSS('opacity', '1')
  await more.click()
  await expect(menu(win)).toBeVisible()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  expect(await labels(win)).toEqual(viaRightClick)
  // Esc: closed, focus back on «⋯».
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)
  await expect(more).toBeFocused()
  await expect(more).toHaveAttribute('aria-expanded', 'false')

  // «Копіювати посилання»: the vault: Markdown link any Markdown field turns into a record link.
  await more.click()
  await item(win, 'Копіювати посилання').click()
  await expect.poll(() => readClipboard(vault)).toBe(`[${title}](vault:idea/${idea.id})`)

  // From the keyboard: Shift+F10 on the focused row, the first item has focus, Enter opens the idea.
  await row.getByRole('button').first().focus()
  await win.keyboard.press('Shift+F10')
  await expect(menu(win)).toBeVisible()
  await expect(item(win, 'Відкрити')).toBeFocused()
  await win.keyboard.press('Enter')
  await expect(menu(win)).toHaveCount(0)
  await expect.poll(() => win.evaluate(() => location.hash)).toContain(`open=${idea.id}`)
})

test('ideas: «У кошик» from the menu fades the row, offers «Скасувати» and moves focus to the next row', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const tag = uid()
  // Newest first: «B» is listed above «A».
  const a = await rpc('ideas.create', { title: `Кошик A ${tag}` })
  const b = await rpc('ideas.create', { title: `Кошик B ${tag}` })
  await go('/ideas')
  const rowB = area(win, `Кошик B ${tag}`)
  const rowA = area(win, `Кошик A ${tag}`)
  await expect(rowB).toBeVisible()

  await rowB.hover()
  await rowB.getByRole('button', { name: `Дії: Кошик B ${tag}` }).click()
  await item(win, 'У кошик').click()
  await expect(rowB).toHaveCount(0)
  await expect(win.getByText('Ідею переміщено в кошик')).toBeVisible()
  // The row after it takes focus (nothing was clicked meanwhile).
  await expect(rowA.getByRole('button').first()).toBeFocused()
  expect(await rpc('ideas.get', b.id)).toBeNull()

  await win.getByRole('button', { name: 'Скасувати' }).click()
  await expect(rowB).toBeVisible()
  expect((await rpc('ideas.get', b.id))?.id).toBe(b.id)
  expect((await rpc('ideas.get', a.id))?.id).toBe(a.id)
})

test('ideas: pins and tags from the menu; a pinned idea offers «Відкріпити»', async ({ vault }) => {
  const { win, rpc, go } = vault
  const title = `Закріп ${uid()}`
  const tagName = `мітка-${uid()}`
  const tag = await rpc('tags.create', { name: tagName, color: '#4f7cff' })
  const idea = await rpc('ideas.create', { title })
  await go('/ideas')
  const row = area(win, title)
  await row.click({ button: 'right' })
  await item(win, 'Закріпити').click()
  await expect
    .poll(async () => (await rpc('pins.state', { type: 'idea', id: idea.id })).pin)
    .toBe(true)

  await row.click({ button: 'right' })
  await expect(item(win, 'Відкріпити')).toBeVisible()
  await item(win, 'Мітки').hover()
  await win.getByRole('menuitemcheckbox', { name: tagName }).click()
  await expect
    .poll(async () => (await rpc('ideas.get', idea.id)).tags.map((t: { id: string }) => t.id))
    .toEqual([tag.id])
  await row.click({ button: 'right' })
  await item(win, 'Мітки').hover()
  await expect(win.getByRole('menuitemcheckbox', { name: tagName })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await win.keyboard.press('Escape')
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)
})

test('snippets: «Копіювати код» from the card menu copies and counts the copy', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const title = `Сніпет меню ${uid()}`
  const code = `const x = '${uid()}'`
  const s = await rpc('snippets.create', { title, language: 'typescript', code })
  await go('/snippets')
  const card = area(win, title)
  await expect(card).toBeVisible()
  await card.hover()
  await card.getByRole('button', { name: `Дії: ${title}` }).click()
  expect(await labels(win)).toEqual([
    'Відкрити',
    'Копіювати код',
    '—',
    'Мова',
    '—',
    'Закріпити',
    'В обране',
    'Копіювати посилання',
    '—',
    'У кошик'
  ])
  await item(win, 'Копіювати код').click()
  await expect.poll(() => readClipboard(vault)).toBe(code)
  await expect.poll(async () => (await rpc('snippets.get', s.id)).copyCount).toBe(1)
})

test('kanban: the card menu moves it and toggles nothing it shouldn’t; «⋯» doesn’t start a drag', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const board = await rpc('boards.create', { title: `Меню дошки ${uid()}` })
  const details = await rpc('boards.details', board.id)
  const [first, second] = details.columns
  const title = `Картка ${uid()}`
  const card = await rpc('cards.create', { boardId: board.id, columnId: first.id, title })
  await go(`/boards/${board.id}`)
  const tile = area(win, title)
  await tile.hover()
  await tile.getByRole('button', { name: `Дії: ${title}` }).click()
  await item(win, 'Пріоритет').hover()
  await win.getByRole('menuitemcheckbox', { name: 'Високий' }).click()
  await expect.poll(async () => (await rpc('cards.get', card.id))?.priority).toBe('high')
  await tile.click({ button: 'right' })
  await item(win, 'Перемістити в').hover()
  await expect(win.getByRole('menuitemcheckbox', { name: first.title })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await win.getByRole('menuitemcheckbox', { name: second.title }).click()
  await expect.poll(async () => (await rpc('cards.get', card.id))?.columnId).toBe(second.id)
})

test('fixes: «Вирішено» is an on/off item with ✓; entity rows: «Зняти цю мітку» with «Скасувати»', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const title = `Помилка ${uid()}`
  const fix = await rpc('fixes.create', { title, resolved: false })
  await go('/fixes')
  const row = area(win, title)
  await row.click({ button: 'right' })
  const resolved = win.getByRole('menuitemcheckbox', { name: 'Вирішено' })
  await expect(resolved).toHaveAttribute('aria-checked', 'false')
  await resolved.click()
  await expect.poll(async () => (await rpc('fixes.get', fix.id))?.resolved).toBe(true)

  const tag = await rpc('tags.create', { name: `зняти-${uid()}`, color: '#4f7cff' })
  await rpc('fixes.update', { id: fix.id, patch: { tagIds: [tag.id] } })
  await go(`/tags?tag=${tag.id}`)
  const entity = area(win, title)
  await entity.click({ button: 'right' })
  await item(win, 'Зняти цю мітку').click()
  await expect.poll(async () => (await rpc('fixes.get', fix.id))?.tags.length).toBe(0)
  await win
    .locator('[data-sonner-toast]')
    .filter({ hasText: 'Мітку знято' })
    .getByRole('button', { name: 'Скасувати' })
    .click()
  await expect
    .poll(async () => (await rpc('fixes.get', fix.id))?.tags.map((t: { id: string }) => t.id))
    .toEqual([tag.id])
})

test('trash: «Видалити назавжди…» asks first; dev project: «Копіювати шлях»', async ({ vault }) => {
  const { win, rpc, go } = vault
  const title = `Сміття ${uid()}`
  const note = await rpc('notes.create', { title })
  await rpc('notes.remove', note.id)
  await go('/trash')
  const row = area(win, title)
  await row.click({ button: 'right' })
  await item(win, 'Видалити назавжди…').click()
  const ask = win.getByRole('alertdialog', { name: 'Видалити назавжди?' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Видалити назавжди' }).click()
  await expect(row).toHaveCount(0)
  // No pointer-events left on <body> by the menu + dialog pair.
  await expect
    .poll(() => win.evaluate(() => getComputedStyle(document.body).pointerEvents))
    .not.toBe('none')

  const projects = await rpc('devProjects.list')
  await go('/dev')
  const card = area(win, projects[0].name)
  await card.click({ button: 'right', position: { x: 200, y: 60 } })
  await item(win, 'Копіювати шлях').click()
  await expect.poll(() => readClipboard(vault)).toBe(projects[0].path)
})

test('gallery: «Копіювати зображення» puts a PNG on the clipboard', async ({ vault }) => {
  const { win, go } = vault
  await go('/designs')
  const tile = area(win, 'Иконка Vault')
  await tile.click({ button: 'right' })
  await item(win, 'Копіювати зображення').click()
  await expect(win.getByText('Зображення скопійовано')).toBeVisible()
  const formats = await vault.app.evaluate(async ({ clipboard }) =>
    (await clipboard.read()).flatMap((i) => i.types)
  )
  expect(formats).toContain('image/png')
})

test('inside a card sheet: menu clicks keep the sheet (view, edit, a confirm on top)', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const board = await rpc('boards.create', { title: `Шторка ${uid()}` })
  const details = await rpc('boards.details', board.id)
  const card = await rpc('cards.create', {
    boardId: board.id,
    columnId: details.columns[0].id,
    title: `Картка ${uid()}`
  })
  const linked = await rpc('ideas.create', { title: `Пов’язана ${uid()}` })
  await rpc('links.create', { fromType: 'card', fromId: card.id, toType: 'idea', toId: linked.id })
  await win.evaluate(async (id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (window as any).vault.rpc('files.add', {
      ref: { type: 'card', id },
      source: {
        kind: 'bytes',
        name: 'нотатки.txt',
        mime: 'text/plain',
        data: new TextEncoder().encode('текст')
      }
    })
    if (!r.ok) throw new Error(r.error)
  }, card.id)
  await go(`/boards/${board.id}?card=${card.id}`)
  const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
  await expect(sheet).toBeVisible()
  const linkRow = sheet.locator('[data-record-menu]').filter({ hasText: linked.title })

  // Reading: «Закріпити» from the link row's menu pins the linked idea, the sheet stays.
  await linkRow.click({ button: 'right' })
  await item(win, 'Закріпити').click()
  await expect
    .poll(async () => (await rpc('pins.state', { type: 'idea', id: linked.id })).pin)
    .toBe(true)
  await expect(sheet).toBeVisible()

  // Editing: a menu click doesn't count as leaving the sheet (no «Зберегти зміни?»).
  await sheet.locator('[data-edit-detail]').click()
  const mode = sheet.locator('[data-detail-mode]').first()
  await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
  await linkRow.click({ button: 'right' })
  await item(win, 'Копіювати посилання').click()
  await expect.poll(() => readClipboard(vault)).toBe(`[${linked.title}](vault:idea/${linked.id})`)
  await expect(sheet).toBeVisible()
  await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
  await expect(win.getByRole('alertdialog')).toHaveCount(0)

  // A confirm over the sheet: one question, «Скасувати» leaves the sheet as it was.
  const fileRow = sheet.locator('[data-record-menu]').filter({ hasText: 'нотатки.txt' })
  await fileRow.click({ button: 'right' })
  await item(win, 'Видалити файл…').click()
  const ask = win.getByRole('alertdialog')
  await expect(ask).toHaveCount(1)
  await ask.getByRole('button', { name: 'Скасувати' }).click()
  await expect(ask).toHaveCount(0)
  await expect(sheet).toBeVisible()
  await expect(mode).toHaveAttribute('data-detail-mode', 'edit')
  expect(await rpc('files.list', { type: 'card', id: card.id })).toHaveLength(1)
})

test('calendar: a chip’s menu inside «ще N» keeps the popover', async ({ vault }) => {
  const { win, rpc, go } = vault
  const token = uid()
  const day = new Date()
  day.setHours(8, 0, 0, 0)
  for (let i = 0; i < 9; i++)
    await rpc('events.create', {
      title: `Подія ${token} ${i}`,
      startAt: day.getTime() + i * 3_600_000
    })
  await go('/calendar')
  const more = win.getByRole('button', { name: /^ще \d+$/ }).first()
  await more.click()
  const popover = win.locator('[data-slot="popover-content"]')
  await expect(popover).toBeVisible()
  const chip = popover.getByRole('button', { name: new RegExp(`Подія ${token} 8`) })
  await chip.click({ button: 'right' })
  await expect(menu(win)).toBeVisible()
  await expect(popover).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)
  await expect(popover).toBeVisible()
  await chip.click({ button: 'right' })
  await item(win, 'Відкрити').click()
  await expect.poll(() => win.evaluate(() => location.hash)).toContain('open=')
})

test('vacancies: «Співбесіда» from the menu offers to plan it, as the editor and the board do', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const title = `Вакансія ${uid()}`
  const a = await rpc('jobs.create', { title })
  await go('/jobs/applications')
  await win.getByLabel('Список', { exact: true }).click()
  try {
    const row = area(win, title)
    await row.click({ button: 'right' })
    await item(win, 'Статус').hover()
    await win.getByRole('menuitemcheckbox', { name: 'Співбесіда' }).click()
    const plan = win.getByRole('dialog', { name: 'Запланувати співбесіду' })
    await expect(plan).toBeVisible()
    await plan.getByRole('button', { name: 'Пізніше' }).click()
    await expect(plan).toHaveCount(0)
    await expect.poll(async () => (await rpc('jobs.get', a.id))?.status).toBe('interview')
  } finally {
    // The view is remembered for the whole run: the next tests expect the board.
    await win.getByLabel('Канбан', { exact: true }).click()
  }
})

test('only one submenu is open: moving to a sibling row or a plain row closes the other', async ({
  vault
}) => {
  const { win, rpc, go } = vault
  const title = `Підменю ${uid()}`
  await rpc('ideas.create', { title })
  await go('/ideas')
  const box = (await area(win, title).boundingBox())!
  await win.mouse.click(box.x + 40, box.y + 20, { button: 'right' })
  await expect(menu(win)).toBeVisible()
  const submenus = win.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]')

  await item(win, 'Статус').hover()
  await expect(submenus).toHaveCount(1)
  await item(win, 'Важливість').hover()
  // The pointer may cross the first submenu's grace area: a second move settles it on the row.
  await item(win, 'Важливість').hover({ position: { x: 20, y: 10 } })
  await expect(item(win, 'Важливість')).toHaveAttribute('aria-expanded', 'true')
  await expect(submenus).toHaveCount(1)
  await expect(item(win, 'Статус')).toHaveAttribute('aria-expanded', 'false')

  await item(win, 'Закріпити').hover()
  await item(win, 'Закріпити').hover({ position: { x: 20, y: 10 } })
  await expect(submenus).toHaveCount(0)
  await expect(menu(win)).toBeVisible()

  // The keyboard too: → opens, ← closes, and the next one opens alone.
  await item(win, 'Статус').focus()
  await win.keyboard.press('ArrowRight')
  await expect(submenus).toHaveCount(1)
  await win.keyboard.press('ArrowLeft')
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('ArrowRight')
  await expect(submenus).toHaveCount(1)
  await win.keyboard.press('Escape')
  await expect(menu(win)).toHaveCount(0)

  // A click away closes the whole menu, an open submenu included.
  await win.mouse.click(box.x + 40, box.y + 20, { button: 'right' })
  await item(win, 'Статус').hover()
  await expect(submenus).toHaveCount(1)
  await win.mouse.click(box.x + box.width - 60, box.y + box.height + 220)
  await expect(menu(win)).toHaveCount(0)
  await expect(submenus).toHaveCount(0)
})
