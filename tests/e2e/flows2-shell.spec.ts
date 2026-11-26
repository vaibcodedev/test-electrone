import type { Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/**
 * Shell flows, round 2 (docs/quality-pass.md §5–6): quick add into every target and the «Відкрити» toast,
 * an unknown address, Ctrl+K by text that is only in the body. Driven through the UI; RPC only checks.
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const hashParam = (win: Page, name: string): Promise<string | null> =>
  win.evaluate((n) => new URLSearchParams(location.hash.split('?')[1] ?? '').get(n), name)

/** The record is shown in a detail pane / sheet / dialog (as text or as a field value), not only in a list row. */
const shownInDetail = (win: Page, title: string): Promise<boolean> =>
  win.evaluate((t) => {
    const scopes = document.querySelectorAll('[data-detail-mode], [role="dialog"]')
    return [...scopes].some(
      (el) =>
        (el.textContent ?? '').includes(t) ||
        [...el.querySelectorAll('input, textarea')].some((f) => (f as HTMLInputElement).value === t)
    )
  }, title)

const TARGETS = [
  { chip: 'Ідея', label: 'Ідея', path: '/ideas', param: 'open' },
  { chip: 'Завдання', label: 'Завдання', path: /^\/boards\/.+/, param: 'card' },
  { chip: 'Claude', label: 'Claude', path: '/claude', param: 'open' },
  { chip: 'Сніпет', label: 'Сніпет', path: '/snippets', param: 'open' },
  { chip: 'Закладка', label: 'Закладка', path: '/bookmarks', param: 'open' },
  { chip: 'Слово', label: 'Слово', path: '/english', param: 'open' },
  { chip: 'Подія', label: 'Подія', path: '/calendar', param: 'open' }
] as const

test.describe('швидке додавання', () => {
  for (const t of TARGETS) {
    test(`Ctrl+N → «${t.chip}» → Enter → тост «Відкрити» відкриває запис`, async ({ vault }) => {
      const { win, rpc } = vault
      const title = `Швидко ${t.chip} ${uid()}`
      await win.keyboard.press('Control+n')
      const dialog = win.getByRole('dialog', { name: 'Швидко додати' })
      await expect(dialog).toBeVisible()
      const chip = dialog.getByRole('radio', { name: t.chip })
      // «Ідея» is the default: clicking the selected chip only moves focus onto it.
      if ((await chip.getAttribute('data-state')) !== 'on') await chip.click()
      await expect(chip).toHaveAttribute('data-state', 'on')
      const field = dialog.getByRole('textbox', { name: `Текст: ${t.chip}` })
      await expect(field).toBeFocused()
      await field.fill(title)
      await field.press('Enter')
      await expect(dialog).toBeHidden()

      const toast = win.locator('[data-sonner-toast]').filter({
        hasText: t.chip === 'Claude' ? `Додано в Claude: ${title}` : `Додано: ${t.label} — ${title}`
      })
      await expect(toast).toBeVisible()
      await toast.getByRole('button', { name: 'Відкрити' }).click()

      if (typeof t.path === 'string') await expect.poll(() => hashPath(win)).toBe(t.path)
      else await expect.poll(() => hashPath(win)).toMatch(t.path)
      const id = await hashParam(win, t.param)
      expect(id, `?${t.param}= after «Відкрити»`).toBeTruthy()
      await expect
        .poll(() => shownInDetail(win, title), 'the record is open, not just listed')
        .toBe(true)

      const hits: { id: string; title: string }[] = await rpc('search.query', {
        text: title,
        limit: 5
      })
      expect(hits.map((h) => h.id)).toContain(id)
    })
  }

  test('Tab перемикає ціль, Esc закриває без запису', async ({ vault }) => {
    const { win, rpc } = vault
    const before = (await rpc('ideas.list', { limit: 500 })).length
    await win.keyboard.press('Control+n')
    const dialog = win.getByRole('dialog', { name: 'Швидко додати' })
    await expect(dialog.getByRole('radio', { name: 'Ідея' })).toHaveAttribute('data-state', 'on')
    await win.keyboard.press('Tab')
    await expect(dialog.getByRole('radio', { name: 'Завдання' })).toHaveAttribute(
      'data-state',
      'on'
    )
    await expect(dialog.getByRole('textbox', { name: 'Текст: Завдання' })).toBeFocused()
    await win.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('radio', { name: 'Ідея' })).toHaveAttribute('data-state', 'on')
    await dialog.getByRole('textbox', { name: 'Текст: Ідея' }).fill('не зберігати')
    await win.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect((await rpc('ideas.list', { limit: 500 })).length).toBe(before)
  })

  test('порожній текст не зберігається: кнопка неактивна', async ({ vault }) => {
    const { win } = vault
    await win.keyboard.press('Control+n')
    const dialog = win.getByRole('dialog', { name: 'Швидко додати' })
    await expect(dialog.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    await dialog.getByRole('textbox').fill('   ')
    await expect(dialog.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
    await dialog.getByRole('textbox').press('Enter')
    await expect(dialog).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

test.describe('невідома адреса', () => {
  test('«Такої сторінки немає» у shell → «На головну»', async ({ vault }) => {
    const { win, go, errors } = vault
    await go(`/nowhere-${uid()}/deep`)
    await expect(win.getByText('Такої сторінки немає')).toBeVisible()
    // Inside the shell: the sidebar is still there, and it is not the crash screen.
    await expect(win.getByRole('button', { name: 'Швидко додати' }).first()).toBeVisible()
    await expect(win.locator('[data-route-error]')).toHaveCount(0)
    await win.getByRole('button', { name: 'На головну' }).click()
    await expect.poll(() => hashPath(win)).toBe('/')
    await expect(win.getByText('Такої сторінки немає')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test.describe('Ctrl+K за текстом', () => {
  test('слово лише в тексті сніпета знаходить його й відкриває', async ({ vault }) => {
    const { win, rpc, go } = vault
    const word = `zq${uid()}xv`
    const snippet = await rpc('snippets.create', {
      title: `Хук debounce ${uid()}`,
      code: `// ${word}\nexport const wait = 1`
    })
    await go('/ideas')
    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    await palette.getByRole('combobox').fill(word)
    const hit = palette.getByRole('option', { name: new RegExp(snippet.title) })
    await expect(hit).toBeVisible()
    // The snippet line shows where the word was found.
    await expect(hit).toContainText(word)
    await win.keyboard.press('Enter')
    await expect(palette).toBeHidden()
    await expect.poll(() => hashPath(win)).toBe('/snippets')
    await expect.poll(() => hashParam(win, 'open')).toBe(snippet.id)
    await expect.poll(() => shownInDetail(win, snippet.title)).toBe(true)
  })

  test('префікс «сн:» лишає тільки сніпети, а «Прибрати фільтр» повертає пошук усюди', async ({
    vault
  }) => {
    const { win, rpc } = vault
    const word = `zq${uid()}pf`
    const snippet = await rpc('snippets.create', { title: `Сніпет ${word}`, code: 'x' })
    const idea = await rpc('ideas.create', { title: `Ідея ${word}` })
    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    const input = palette.getByRole('combobox')
    const found = (title: string) => palette.getByRole('option', { name: new RegExp(title) })

    await input.fill('сн')
    await palette.getByRole('option', { name: 'Шукати лише: Сніпети' }).click()
    await expect(input).toHaveValue('сн: ')
    await expect(input).toBeFocused()
    await expect(found(snippet.title)).toBeVisible()

    await input.fill(`сн: ${word}`)
    await expect(found(snippet.title)).toBeVisible()
    await expect(found(idea.title)).toBeHidden()

    await input.fill(`нт: ${word}`)
    await palette.getByRole('option', { name: 'Прибрати фільтр і шукати всюди' }).click()
    await expect(input).toHaveValue(word)
    await expect(found(idea.title)).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(palette).toBeHidden()
  })

  test('нічого не знайдено → «Додати … як ідею» → швидке додавання з текстом', async ({
    vault
  }) => {
    const { win, rpc } = vault
    const text = `qqnothing${uid()}`
    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    await palette.getByRole('combobox').fill(text)
    const add = palette.getByRole('option', { name: `Додати «${text}» як ідею` })
    await expect(add).toBeVisible()
    await add.click()
    const dialog = win.getByRole('dialog', { name: 'Швидко додати' })
    await expect(dialog.getByRole('textbox', { name: 'Текст: Ідея' })).toHaveValue(text)
    await dialog.getByRole('textbox').press('Enter')
    await expect(win.locator('[data-sonner-toast]').filter({ hasText: text })).toBeVisible()
    await expect
      .poll(async () =>
        (await rpc('ideas.list', { search: text })).map((i: { title: string }) => i.title)
      )
      .toEqual([text])
  })
})

test.describe('перетягування й прокрутка', () => {
  test('«Мої проєкти»: папка над сторінкою — підказка «Відпустіть…»; не з диска — тост', async ({
    vault
  }) => {
    const { win, go } = vault
    await go('/dev')
    await expect(win.getByRole('heading', { name: 'Мої проєкти' })).toBeVisible()
    // A File made in the page has no path on disk, as a drag from a browser: the page asks for a folder.
    const target = win.locator('[data-slot="page-header"]').first()
    const dt = await win.evaluateHandle(() => {
      const d = new DataTransfer()
      d.items.add(new File(['x'], 'repo'))
      return d
    })
    await target.dispatchEvent('dragenter', { dataTransfer: dt })
    await expect(win.getByText('Відпустіть, щоб додати проєкти')).toBeVisible()
    await target.dispatchEvent('drop', { dataTransfer: dt })
    await expect(win.getByText('Відпустіть, щоб додати проєкти')).toBeHidden()
    await expect(
      win.locator('[data-sonner-toast]').filter({ hasText: 'Перетягніть папку з диска' })
    ).toBeVisible()
  })

  test('смуга прокрутки видна лише поки область прокручується', async ({ vault }) => {
    const { win, go } = vault
    await go('/guide')
    const scroller = await win.evaluateHandle(() => {
      const all = [...document.querySelectorAll('body *')] as HTMLElement[]
      return all.find(
        (el) => el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY === 'auto'
      )!
    })
    await expect
      .poll(() => scroller.evaluate((el) => el.hasAttribute('data-scrolling')))
      .toBe(false)
    await scroller.evaluate((el) => el.scrollBy(0, 200))
    await expect.poll(() => scroller.evaluate((el) => el.hasAttribute('data-scrolling'))).toBe(true)
    // …and hides again a moment after the scroll stops.
    await expect
      .poll(() => scroller.evaluate((el) => el.hasAttribute('data-scrolling')), { timeout: 3000 })
      .toBe(false)
  })
})

test('«Меню»: вимкнений розділ згортається в бічній панелі, а не зникає миттєво', async ({
  vault
}) => {
  const { win, go } = vault
  await go('/settings')
  const hubButton = win.locator('#app-sidebar [data-nav-hub="work"]')
  await expect(hubButton).toBeVisible()
  // The fold lasts 200 ms — too short to poll for, so the page records what it saw.
  await win.evaluate(() => {
    const w = window as unknown as { seen: string[] }
    w.seen = []
    new MutationObserver(() => {
      const li = document.querySelector('#app-sidebar li:has([data-nav-hub="work"])')
      if (li?.hasAttribute('data-leaving'))
        w.seen.push(
          `leaving inert=${li.hasAttribute('inert')} h=${li.getBoundingClientRect().height}`
        )
    }).observe(document.getElementById('app-sidebar')!, {
      subtree: true,
      childList: true,
      attributes: true
    })
  })
  const toggle = win.getByRole('switch', { name: 'Робота', exact: true })
  await toggle.click()
  await expect(hubButton).toHaveCount(0)
  const seen = await win.evaluate(() => (window as unknown as { seen: string[] }).seen)
  expect(seen[0]).toMatch(/^leaving inert=true/)
  await toggle.click()
  await expect(hubButton).toBeVisible()
})
