import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * «Налаштування → Меню»: sections switched off leave the sidebar, Ctrl+K «Розділи», Alt+1…9, quick add, home
 * and the weekly review; records stay reachable. The `vault` fixture shows everything again before each test.
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const sidebar = (win: Page): ReturnType<Page['locator']> => win.locator('[data-slot=app-sidebar]')
const menu = (win: Page): ReturnType<Page['locator']> => win.locator('#menu')
const ALL_HUBS = ['work', 'freelance', 'jobs', 'finance', 'dev', 'knowledge', 'inspiration']

test.afterEach(async ({ vault }) => {
  await vault.rpc('settings.update', { hiddenNavHubs: [], hiddenNavItems: [] })
})

test.describe('меню: сховати розділи', () => {
  test('вимкнений «Фриланс» зникає з меню й Ctrl+K, сторінки відкриваються', async ({ vault }) => {
    const { win, go } = vault
    await go('/settings#menu')
    await menu(win).getByRole('switch', { name: 'Фриланс' }).click()
    await expect(sidebar(win).getByRole('button', { name: 'Фриланс' })).toHaveCount(0)
    await expect(menu(win).getByText(/Сховано з меню/)).toBeVisible()

    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    await palette.getByRole('combobox').fill('Клієнти')
    await expect(palette.locator('[cmdk-group-heading]', { hasText: 'Розділи' })).toHaveCount(0)
    await win.keyboard.press('Escape')

    await go('/clients')
    await expect.poll(() => hashPath(win)).toBe('/clients')
  })

  test('пункт усередині групи: «Показано 2 з 3»; «Календар» угорі має свій перемикач', async ({ vault }) => {
    const { win, go } = vault
    await go('/settings#menu')
    await menu(win).getByRole('button', { name: 'Показати пункти розділу «Інструменти»' }).click()
    await menu(win).getByRole('switch', { name: 'Показувати «Дошки» в меню' }).click()
    await expect(menu(win).getByText('Показано 2 з 3')).toBeVisible()
    await expect(sidebar(win).getByRole('link', { name: /^Дошки/ })).toHaveCount(0)
    await menu(win).getByRole('switch', { name: 'Календар', exact: true }).click()
    await expect(sidebar(win).getByRole('link', { name: /^Календар/ })).toHaveCount(0)
  })

  test('Alt-цифри йдуть за видимим меню; останній розділ не ховається', async ({ vault }) => {
    const { win, go, rpc, rpcRaw } = vault
    await rpc('settings.update', { hiddenNavHubs: ['freelance', 'jobs', 'finance', 'knowledge'] })
    await go('/')
    await win.keyboard.press('Alt+4')
    await expect.poll(() => hashPath(win)).toBe('/ideas')
    await win.keyboard.press('Alt+7')
    await expect.poll(() => hashPath(win)).toBe('/dev')

    await rpc('settings.update', { hiddenNavHubs: ALL_HUBS.filter((h) => h !== 'dev') })
    await go('/settings#menu')
    await expect(menu(win).getByRole('switch', { name: 'Розробка' })).toBeDisabled()
    await expect(menu(win).getByText('Хоча б один розділ лишається в меню')).toBeVisible()

    const r = await rpcRaw('settings.update', { hiddenNavHubs: ALL_HUBS })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Залиште в меню хоча б один розділ.')
  })

  test('«Показати все» повертає все, кнопка зникає, фокус — на першому перемикачі', async ({
    vault
  }) => {
    const { win, go, rpc } = vault
    await rpc('settings.update', {
      hiddenNavHubs: ['jobs', 'finance'],
      hiddenNavItems: ['/review']
    })
    await go('/settings#menu')
    const showAll = menu(win).getByRole('button', { name: 'Показати все' })
    await showAll.click()
    await expect(showAll).toHaveCount(0)
    await expect(sidebar(win).getByRole('button', { name: 'Пошук роботи', exact: true })).toBeVisible()
    await expect(menu(win).getByRole('switch', { name: 'Інструменти' })).toBeFocused()
    const s = await rpc('settings.get')
    expect(s.hiddenNavHubs).toEqual([])
    expect(s.hiddenNavItems).toEqual([])
  })

  test('правий клік → «Сховати», «Повернути» не відкочує інші зміни', async ({ vault }) => {
    const { win, rpc } = vault
    const ideas = sidebar(win).getByRole('link', { name: /^Ідеї/ })
    await ideas.click({ button: 'right' })
    await win.getByRole('menuitem', { name: 'Сховати «Ідеї»' }).click()
    await expect(ideas).toHaveCount(0)

    // Between hiding and «Повернути» another section is switched off: it must stay off.
    await rpc('settings.update', { hiddenNavHubs: ['finance'], hiddenNavItems: ['/ideas'] })
    await win
      .locator('[data-sonner-toast]', { hasText: '«Ідеї» сховано з меню' })
      .getByRole('button', { name: 'Повернути' })
      .click()
    await expect(sidebar(win).getByRole('link', { name: /^Ідеї/ })).toBeVisible()
    await expect(sidebar(win).getByRole('button', { name: 'Фінанси' })).toHaveCount(0)

    // The Slot chain (context menu → link) keeps navigation and aria-current.
    const boards = sidebar(win).getByRole('link', { name: /^Дошки/ })
    await boards.click()
    await expect.poll(() => hashPath(win)).toBe('/boards')
    await expect(boards).toHaveAttribute('aria-current', 'page')
  })

  test('швидкі кліки підряд зберігаються всі', async ({ vault }) => {
    const { win, go, rpc } = vault
    await go('/settings#menu')
    for (const name of ['Фриланс', 'Пошук роботи', 'Фінанси'])
      await menu(win).getByRole('switch', { name }).click()
    await expect
      .poll(async () => ((await rpc('settings.get')).hiddenNavHubs as string[]).sort())
      .toEqual(['finance', 'freelance', 'jobs'])
  })

  test('сховані «База знань»: у швидкому додаванні немає «Сніпет»', async ({ vault }) => {
    const { win, rpc, go } = vault
    await rpc('settings.update', { hiddenNavHubs: ['knowledge'] })
    await go('/')
    await win.keyboard.press('Control+n')
    const dialog = win.getByRole('dialog', { name: 'Швидко додати' })
    await expect(dialog.getByRole('radio', { name: 'Ідея' })).toBeVisible()
    await expect(dialog.getByRole('radio', { name: 'Сніпет' })).toHaveCount(0)
    const field = dialog.getByRole('textbox')
    for (let i = 0; i < 8; i++) {
      await field.press('Tab')
      await expect(dialog.getByRole('textbox', { name: 'Текст: Сніпет' })).toHaveCount(0)
    }
    await win.keyboard.press('Escape')
  })

  test('головна без схованих розділів: немає «Зберегти сніпет» і «Час»', async ({ vault }) => {
    const { win, rpc, go } = vault
    await rpc('settings.update', { hiddenNavHubs: ['freelance', 'jobs', 'finance', 'knowledge'] })
    await go('/')
    await expect(win.getByText('Записати ідею')).toBeVisible()
    await expect(win.getByText('Зберегти сніпет')).toHaveCount(0)
    await expect(win.locator('main').getByText('Час', { exact: true })).toHaveCount(0)
  })

  test('«Підсумки тижня» без «Пошуку роботи»', async ({ vault }) => {
    const { win, rpc, go } = vault
    await rpc('settings.update', { hiddenNavHubs: ['jobs'] })
    await go('/review')
    await expect(win.locator('main [data-slot=page-header]')).toBeVisible()
    // Neither a section card nor a name in the «Без змін…» line.
    await expect(win.locator('main').getByText(/Пошук роботи/)).toHaveCount(0)
  })
})
