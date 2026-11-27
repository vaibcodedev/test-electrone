import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Folding the sidebar to a strip of icons: the title-bar button, Ctrl+B and Ctrl+K; tooltips and flyout menus;
 * the state survives a reload. The `vault` fixture unfolds it before every test (one window for the run).
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const column = (win: Page): ReturnType<Page['locator']> => win.locator('[data-slot=app-sidebar]')
const fold = (win: Page): ReturnType<Page['locator']> =>
  win.getByRole('button', { name: 'Згорнути бічну панель', exact: true })
const unfold = (win: Page): ReturnType<Page['locator']> =>
  win.getByRole('button', { name: 'Розгорнути бічну панель', exact: true })
const mainWidth = (win: Page): Promise<number> =>
  win.locator('main').evaluate((el) => el.getBoundingClientRect().width)
/** The page is clickable: no leftover `pointer-events: none` on <body> from a closed menu. */
const bodyClickable = (win: Page): Promise<string> =>
  win.evaluate(() => getComputedStyle(document.body).pointerEvents)

test.describe('бічна панель: згортання', () => {
  test('кнопка в шапці згортає панель, сторінка ширшає', async ({ vault }) => {
    const { win } = vault
    const before = await mainWidth(win)
    await fold(win).click()
    await expect(column(win)).toHaveAttribute('data-state', 'collapsed')
    expect(await mainWidth(win)).toBeGreaterThanOrEqual(before + 150)
    await expect(unfold(win)).toHaveAttribute('aria-expanded', 'false')
    await expect(unfold(win)).toHaveAttribute('aria-controls', 'app-sidebar')
  })

  test('Ctrl+B з поля пошуку — рівно одне перемикання, текст не змінюється', async ({ vault }) => {
    const { win, go } = vault
    await go('/ideas')
    const search = win.locator('[data-page-search]')
    await search.fill('abc')
    await search.press('Control+b')
    await expect(column(win)).toHaveAttribute('data-state', 'collapsed')
    await expect(search).toHaveValue('abc')
    await search.press('Control+b')
    await expect(column(win)).toHaveAttribute('data-state', 'expanded')
  })

  test('тултип із назвою — лише у згорнутій панелі', async ({ vault }) => {
    const { win } = vault
    const home = column(win).getByRole('link', { name: 'Головна' })
    await home.hover()
    await win.waitForTimeout(600)
    await expect(win.getByRole('tooltip', { name: 'Головна' })).toHaveCount(0)
    await win.mouse.move(800, 500)
    await fold(win).click()
    await home.hover()
    await expect(win.getByRole('tooltip', { name: 'Головна' })).toBeVisible()
  })

  test('меню групи «Робота» праворуч: перехід і поточний пункт', async ({ vault }) => {
    const { win } = vault
    await fold(win).click()
    const work = column(win).getByRole('button', { name: 'Робота' })
    await work.click()
    const flyout = win.getByRole('menu')
    await expect(flyout).toBeVisible()
    await expect(work).toHaveAttribute('aria-expanded', 'true')
    for (const name of [/^Ідеї/, /^Дошки/, /^Календар/, /^Чек-листи/])
      await expect(flyout.getByRole('menuitem', { name })).toBeVisible()
    await flyout.getByRole('menuitem', { name: /^Ідеї/ }).click()
    await expect.poll(() => hashPath(win)).toBe('/ideas')
    await expect(flyout).toBeHidden()
    await expect(work).toHaveAttribute('data-active', 'true')
    await work.click()
    await expect(win.getByRole('menuitem', { name: /^Ідеї/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await win.keyboard.press('Escape')
  })

  test('«Фриланс»: огляд і «Додати платформу»', async ({ vault }) => {
    const { win } = vault
    await fold(win).click()
    const freelance = column(win).getByRole('button', { name: 'Фриланс' })
    await freelance.click()
    await win.getByRole('menuitem', { name: 'Огляд' }).click()
    await expect.poll(() => hashPath(win)).toBe('/freelance')
    // The menu fades out for ~150 ms after «Огляд»; reopening it inside that window is a timing race in Radix
    // (the leaving layer may still catch the click), not what this test is about — wait until it is gone.
    await expect(win.getByRole('menu')).toHaveCount(0)
    await freelance.click()
    await win.getByRole('menuitem', { name: 'Додати платформу' }).click()
    await expect(win.getByRole('dialog')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.getByRole('dialog')).toBeHidden()
    expect(await bodyClickable(win)).not.toBe('none')
  })

  test('клавіатура: Enter відкриває, Esc повертає фокус без тултипа', async ({ vault }) => {
    const { win } = vault
    await fold(win).click()
    const work = column(win).getByRole('button', { name: 'Робота' })
    await work.focus()
    await win.keyboard.press('Enter')
    await expect(win.getByRole('menu')).toBeVisible()
    await win.keyboard.press('ArrowDown')
    await win.keyboard.press('Escape')
    await expect(win.getByRole('menu')).toBeHidden()
    await expect(work).toBeFocused()
    await expect(win.getByRole('tooltip', { name: 'Робота' })).toHaveCount(0)
  })

  test('Ctrl+B при відкритому меню групи', async ({ vault }) => {
    const { win } = vault
    await fold(win).click()
    await column(win).getByRole('button', { name: 'База знань' }).click()
    await expect(win.getByRole('menu')).toBeVisible()
    await win.keyboard.press('Control+b')
    await expect(column(win)).toHaveAttribute('data-state', 'expanded')
    await expect(win.getByRole('menu')).toHaveCount(0)
    expect(await bodyClickable(win)).not.toBe('none')
  })

  test('стан пам’ятається після перезавантаження', async ({ vault }) => {
    const { win } = vault
    await fold(win).click()
    await win.reload()
    await win.waitForFunction(() => document.querySelector('[data-slot=app-sidebar]'))
    await expect(column(win)).toHaveAttribute('data-state', 'collapsed')
  })

  test('у «Дизайнах» більше колонок', async ({ vault }) => {
    const { win, go } = vault
    await go('/designs')
    const cols = (): Promise<number> =>
      win.evaluate(() => {
        const row = [...document.querySelectorAll<HTMLElement>('main *')].find((el) =>
          el.style.gridTemplateColumns.startsWith('repeat(')
        )
        return Number(/repeat\((\d+)/.exec(row?.style.gridTemplateColumns ?? '')?.[1] ?? 0)
      })
    const before = await cols()
    test.skip(before === 0, 'у галереї немає сітки')
    await win.keyboard.press('Control+b')
    await expect.poll(cols).toBeGreaterThan(before)
  })

  test('Ctrl+K «панель» і довідка Ctrl+/', async ({ vault }) => {
    const { win } = vault
    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    await palette.getByRole('combobox').fill('панель')
    await expect(palette.getByRole('option', { name: /Згорнути бічну панель/ })).toBeVisible()
    await palette.getByRole('option', { name: /Згорнути бічну панель/ }).click()
    await expect(column(win)).toHaveAttribute('data-state', 'collapsed')

    await win.keyboard.press('Control+/')
    await expect(
      win.getByRole('dialog').getByText('Згорнути / розгорнути бічну панель')
    ).toBeVisible()
    await win.keyboard.press('Escape')
  })

  test('960×640: останню групу видно з клавіатури', async ({ vault }) => {
    const { win, app } = vault
    const resize = (w: number, h: number): Promise<void> =>
      app.evaluate(
        ({ BrowserWindow }, [width, height]) => {
          const bw = BrowserWindow.getAllWindows().find((x) => x.isVisible())
          bw?.setSize(width, height)
        },
        [w, h] as const
      )
    try {
      await resize(960, 640)
      await fold(win).click()
      const last = column(win).getByRole('button', { name: 'Навчання' })
      await last.focus()
      await expect(last).toBeInViewport()
    } finally {
      await resize(1440, 900)
    }
  })
})
