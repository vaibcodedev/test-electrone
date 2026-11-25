import type { Locator, Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/**
 * Keyboard flows (app/shortcuts.ts, hooks/use-global-shortcuts.ts): N, E, Esc, /, Ctrl+K, Ctrl+/, G-sequences,
 * «Зберегти зміни?» on Esc with unsaved edits and the empty draft that disappears when closed.
 * edit-mode.spec.ts covers the idea pane's Esc dialog; here it is notes, vacancies (a sheet) and the keys.
 */

const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()
const titleField = (win: Page): Locator => win.getByRole('textbox', { name: 'Назва' })
const openParam = (win: Page): Promise<string | null> =>
  win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))
const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
/** Keys go to the page, not to a field left focused by the previous step. */
const blur = (win: Page): Promise<void> =>
  win.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
/** Route chunks are lazy: N is pressed once the page's lime button is on screen. */
const ready = (win: Page, button: string): Promise<void> =>
  expect(
    win.locator('[data-slot="page-header"]').getByRole('button', { name: button, exact: true })
  ).toBeVisible()

test.describe('N — створити на сторінці', () => {
  test('нотатки: N створює нотатку в режимі правки; Esc без змін прибирає її зовсім', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    await go('/notes')
    await ready(win, 'Нотатка')
    await blur(win)
    await win.keyboard.press('n')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const id = await openParam(win)
    expect(id).toBeTruthy()
    expect(await rpc('notes.get', id)).not.toBeNull()

    await blur(win)
    await win.keyboard.press('Escape')
    await expect(pane(win)).toHaveCount(0)
    await expect.poll(() => rpc('notes.get', id)).toBeNull()
    // Not in the trash either: it never existed for the user.
    expect((await rpc('trash.list', { limit: 500 })).some((t: { id: string }) => t.id === id)).toBe(
      false
    )
  })

  // docs/quality-pass.md §3 «Только что создано: сразу правка, фокус в первом поле»: N → type the name at once.
  test('нова нотатка: фокус одразу в назві', async ({ vault }) => {
    const { win, go } = vault
    await go('/notes')
    await ready(win, 'Нотатка')
    await blur(win)
    await win.keyboard.press('n')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    await expect(titleField(win)).toBeFocused({ timeout: 3000 })
    await win.keyboard.press('Escape')
    await expect(pane(win)).toHaveCount(0)
  })

  test('порожня чернетка, закрита хрестиком, видаляється; повторне N не плодить чернеток', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    await go('/notes')
    await ready(win, 'Нотатка')
    await blur(win)
    await win.keyboard.press('n')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const first = await openParam(win)
    await pane(win).getByRole('button', { name: 'Закрити' }).click()
    await expect(pane(win)).toHaveCount(0)
    await expect.poll(() => rpc('notes.get', first), { timeout: 5000 }).toBeNull()

    // Two N in a row (second while the first draft is open) → one draft.
    await blur(win)
    await win.keyboard.press('n')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    const a = await openParam(win)
    await blur(win)
    await win.keyboard.press('n')
    await expect.poll(() => openParam(win)).toBe(a)
    await pane(win).getByRole('button', { name: 'Скасувати' }).click()
    await expect.poll(() => rpc('notes.get', a)).toBeNull()
  })

  test('N у полі пошуку — це літера, а не нова нотатка', async ({ vault }) => {
    const { win, rpc, go } = vault
    const before = (await rpc('notes.list', { limit: 1000 })).length
    await go('/notes')
    await ready(win, 'Нотатка')
    await win.locator('[data-page-search]').click()
    await win.keyboard.type('nn')
    await expect(win.locator('[data-page-search]')).toHaveValue('nn')
    await expect(pane(win)).toHaveCount(0)
    expect((await rpc('notes.list', { limit: 1000 })).length).toBe(before)
  })

  test('клієнти: N відкриває «Новий проєкт» (лаймова кнопка сторінки)', async ({ vault }) => {
    const { win, go } = vault
    await go('/clients')
    await ready(win, 'Проєкт')
    await blur(win)
    await win.keyboard.press('n')
    const dialog = win.getByRole('dialog', { name: 'Новий проєкт' })
    await expect(dialog).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  // The calendar has its own header; it must still carry data-slot="page-header" for the global N.
  test('календар: N відкриває «Нова подія»', async ({ vault }) => {
    const { win, go } = vault
    await go('/calendar')
    await expect(win.getByRole('button', { name: 'Подія', exact: true })).toBeVisible()
    await blur(win)
    await win.keyboard.press('n')
    await expect(win.getByRole('dialog', { name: 'Нова подія' })).toBeVisible({ timeout: 3000 })
    await win.keyboard.press('Escape')
  })
})

test.describe('E і Esc у записі', () => {
  test('E → правка, Esc → перегляд, ще Esc → запис закрито', async ({ vault }) => {
    const { win, rpc, go } = vault
    const note = await rpc('notes.create', { title: `Клавіші ${uid()}`, body: 'текст' })
    await go(`/notes?open=${note.id}`)
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await blur(win)
    await win.keyboard.press('e')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    await expect(titleField(win)).toBeVisible()
    await blur(win)
    await win.keyboard.press('Escape')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect(win.getByRole('alertdialog')).toHaveCount(0)
    await win.keyboard.press('Escape')
    await expect(pane(win)).toHaveCount(0)
    await expect.poll(() => openParam(win)).toBeNull()
  })

  test('нотатка: змінити текст → Esc → «Зберегти зміни?» → «Не зберігати» повертає як було', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const note = await rpc('notes.create', { title: `Esc ${uid()}`, body: 'Початковий текст' })
    await go(`/notes?open=${note.id}`)
    await blur(win)
    await win.keyboard.press('e')
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'edit')
    await pane(win).getByRole('radio', { name: 'Текст' }).click()
    const body = pane(win).getByPlaceholder(/Пишіть у Markdown/)
    await body.fill('Новий текст, який не треба')
    // Esc right from the field (the focus is still there).
    await body.press('Escape')
    const ask = win.getByRole('alertdialog', { name: 'Зберегти зміни?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Не зберігати' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('notes.get', note.id)).body).toBe('Початковий текст')
    await expect(pane(win).getByText('Початковий текст')).toBeVisible()
  })

  test('вакансія (шторка): змінити назву → Esc → «Зберегти зміни?» → «Зберегти»', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const a = await rpc('jobs.create', { title: `Шторка ${uid()}` })
    await go(`/jobs/applications?open=${a.id}`)
    const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
    await sheet.locator('[data-edit-detail]').click()
    const next = `Збережена ${uid()}`
    await titleField(win).fill(next)
    await titleField(win).press('Escape')
    const ask = win.getByRole('alertdialog', { name: 'Зберегти зміни?' })
    await expect(ask).toBeVisible()
    // The sheet is still open behind the question (hidden from the a11y tree while it is asked).
    await expect(win.locator('[data-slot="sheet-content"]')).toBeVisible()
    await ask.getByRole('button', { name: 'Зберегти' }).click()
    await expect(sheet.locator('[data-detail-mode]').first()).toHaveAttribute(
      'data-detail-mode',
      'view'
    )
    await expect.poll(async () => (await rpc('jobs.get', a.id)).title).toBe(next)
  })

  test('вакансія (шторка): Esc у перегляді закриває шторку без питань', async ({ vault }) => {
    const { win, rpc, go } = vault
    const a = await rpc('jobs.create', { title: `Закрити ${uid()}` })
    await go(`/jobs/applications?open=${a.id}`)
    const sheet = win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
    await expect(sheet.locator('[data-edit-detail]')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(win.getByRole('alertdialog')).toHaveCount(0)
    await expect.poll(() => openParam(win)).toBeNull()
  })

  // «Скасувати» right after typing (before the 600 ms autosave): the flush saves the typed title, the revert brings
  // back the value the query already held, so the field's draft must be reset explicitly (resetAllAutosaves).
  test('«Скасувати» одразу після введення показує стару назву', async ({ vault }) => {
    const { win, rpc, go } = vault
    const note = await rpc('notes.create', { title: `Скасування ${uid()}`, body: 'текст' })
    await go(`/notes?open=${note.id}`)
    await pane(win).locator('[data-edit-detail]').click()
    await titleField(win).fill('Набране й скасоване')
    await pane(win).getByRole('button', { name: 'Скасувати' }).click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect.poll(async () => (await rpc('notes.get', note.id)).title).toBe(note.title)
    await expect(win.getByRole('heading', { name: note.title })).toBeVisible({ timeout: 3000 })
  })
})

test.describe('пошук і довідка з клавіатури', () => {
  test('/ фокусує пошук розділу; Esc у полі очищає його', async ({ vault }) => {
    const { win, rpc, go } = vault
    const token = `sl${uid()}`
    await rpc('notes.create', { title: `Слеш ${token}` })
    const other = await rpc('notes.create', { title: `Інша ${uid()}` })
    await go('/notes')
    await ready(win, 'Нотатка')
    await blur(win)
    await win.keyboard.press('/')
    const search = win.locator('[data-page-search]')
    await expect(search).toBeFocused()
    // «/» itself is not typed into the field.
    await expect(search).toHaveValue('')
    await win.keyboard.type(token)
    await expect(win.getByText(`Слеш ${token}`)).toBeVisible()
    await expect(win.getByText(other.title)).toHaveCount(0)
    await win.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await expect(win.getByText(other.title)).toBeVisible()
  })

  test('Ctrl+K відкриває пошук навіть із поля; Esc закриває; розділ по назві', async ({
    vault
  }) => {
    const { win, go } = vault
    await go('/ideas')
    await win.locator('[data-page-search]').click()
    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('combobox')).toBeFocused()
    await win.keyboard.press('Escape')
    await expect(palette).toBeHidden()

    await win.keyboard.press('Control+k')
    await palette.getByRole('combobox').fill('Нотатки')
    await palette.getByRole('option', { name: 'Нотатки', exact: true }).click()
    await expect.poll(() => hashPath(win)).toBe('/notes')
  })

  test('Ctrl+/ і ? відкривають «Гарячі клавіші» з N, E, Esc і /', async ({ vault }) => {
    const { win, go } = vault
    await go('/')
    await blur(win)
    await win.keyboard.press('Control+/')
    const help = win.getByRole('dialog', { name: 'Гарячі клавіші' })
    await expect(help).toBeVisible()
    for (const label of [
      'Створити (головна кнопка сторінки)',
      'Редагувати відкритий запис',
      'Вийти з редагування / закрити запис',
      'Перейти до пошуку в розділі',
      'Знайти будь-що'
    ])
      await expect(help.getByText(label)).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(help).toBeHidden()

    await blur(win)
    await win.keyboard.press('Shift+/')
    await expect(help).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(help).toBeHidden()
  })

  test('G, потім I — до ідей; G, потім T — до кошика; клавіші не спрацьовують за відкритим діалогом', async ({
    vault
  }) => {
    const { win, go } = vault
    await go('/')
    await blur(win)
    await win.keyboard.press('g')
    await win.keyboard.press('i')
    await expect.poll(() => hashPath(win)).toBe('/ideas')
    await blur(win)
    await win.keyboard.press('g')
    await win.keyboard.press('t')
    await expect.poll(() => hashPath(win)).toBe('/trash')

    // Behind the help dialog G I does nothing.
    await win.keyboard.press('Control+/')
    await expect(win.getByRole('dialog', { name: 'Гарячі клавіші' })).toBeVisible()
    await win.keyboard.press('g')
    await win.keyboard.press('i')
    expect(await hashPath(win)).toBe('/trash')
    await win.keyboard.press('Escape')
  })
})
