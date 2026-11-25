import type { Page } from '@playwright/test'
import { expect, test, uid, type Vault } from './fixtures'

/**
 * Media flows, round 2 (docs/quality-pass.md §4, §6): an imported image gets its palette in the gallery, the
 * «Колір» filter finds it, «У добірку» puts it on a moodboard; a bookmark link typed without a scheme is saved
 * and opened as https://. RPC only prepares (image bytes) and checks.
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const openParam = (win: Page): Promise<string | null> =>
  win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))

/** Draws a solid-colour PNG in the page and imports it as a design (the same path as a pasted screenshot). */
async function importSolidImage(
  win: Page,
  name: string,
  color: string
): Promise<{ id: string; title: string }> {
  return win.evaluate(
    async ([n, c]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 120
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 160, 120)
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
      const data = new Uint8Array(await blob.arrayBuffer())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (window as any).vault.rpc('designs.importImage', {
        source: { kind: 'bytes', name: `${n}.png`, mime: 'image/png', data }
      })
      if (!res.ok) throw new Error(res.error)
      return { id: res.data.id as string, title: res.data.title as string }
    },
    [name, color] as const
  )
}

/** Records shell.openExternal calls in main instead of opening a browser; returns a reader and a restore. */
async function stubOpenExternal(
  vault: Vault
): Promise<{ opened: () => Promise<string[]>; restore: () => Promise<void> }> {
  await vault.app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __open?: typeof shell.openExternal; __opened: string[] }
    g.__open ??= shell.openExternal
    g.__opened = []
    shell.openExternal = (async (url: string) => {
      g.__opened.push(url)
    }) as typeof shell.openExternal
  })
  return {
    opened: () =>
      vault.app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened),
    restore: () =>
      vault.app.evaluate(({ shell }) => {
        const g = globalThis as unknown as { __open?: typeof shell.openExternal }
        if (g.__open) shell.openExternal = g.__open
      })
  }
}

test.describe('дизайни: галерея, колір, добірка', () => {
  test('картинка → палітра в галереї → «Колір» лишає лише її → «У добірку» → добірка показує її', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = uid()
    const design = await importSolidImage(win, `magenta-${token}`, '#ff00ff')
    expect(design.title).toBe(`magenta ${token}`)
    const board = await rpc('moodboards.create', { title: `Неон ${token}` })

    await go('/designs')
    const tile = win.locator('[data-slot="card"]').filter({ hasText: design.title })
    await expect(tile).toBeVisible()
    // The gallery fills a missing palette in the background.
    await expect
      .poll(async () => (await rpc('designs.get', design.id)).colors, { timeout: 15_000 })
      .toContain('#ff00ff')

    // «Колір» → the magenta swatch → only designs with that colour stay.
    await win.getByRole('button', { name: 'Колір', exact: true }).click()
    const swatches = win.getByRole('radiogroup', { name: 'Фільтр за кольором' })
    await expect(swatches).toBeVisible()
    await swatches.getByRole('radio', { name: '#ff00ff' }).click()
    await expect(swatches).toBeHidden()
    await expect(tile).toBeVisible()
    await expect(win.locator('[data-slot="card"]').filter({ hasText: 'Иконка Vault' })).toHaveCount(
      0
    )
    const filtered: { id: string }[] = await rpc('designs.list', { color: '#ff00ff' })
    expect(filtered.map((d) => d.id)).toContain(design.id)

    // Open it → «У добірку» → our board.
    await tile.click()
    await expect.poll(() => openParam(win)).toBe(design.id)
    await win.getByRole('button', { name: 'У добірку' }).click()
    await win
      .locator('[data-slot="popover-content"]')
      .getByRole('option', { name: new RegExp(board.title) })
      .click()
    await expect(win.getByText(`Дизайн додано в «${board.title}»`).first()).toBeVisible()
    await expect
      .poll(async () => (await rpc('moodboards.details', board.id))?.designs?.length ?? 0)
      .toBe(1)

    // «Скинути колір» brings the rest back.
    await win.keyboard.press('Escape')
    await win.getByRole('button', { name: 'Скинути колір' }).click()
    await expect(
      win.locator('[data-slot="card"]').filter({ hasText: 'Иконка Vault' }).first()
    ).toBeVisible()

    // The board tile counts it; opening the board shows the design.
    const boardTile = win.locator('[data-slot="card"]').filter({ hasText: board.title })
    await expect(boardTile).toContainText('1')
    await boardTile.click()
    await expect.poll(() => hashPath(win)).toBe(`/designs/boards/${board.id}`)
    await expect(win.getByText(design.title).first()).toBeVisible()
  })
})

test.describe('закладка: посилання без схеми', () => {
  test('«example.org/…» зберігається й відкривається як https://', async ({ vault }) => {
    const { win, rpc, go } = vault
    const token = uid()
    const typed = `example.org/read-${token}`
    const stub = await stubOpenExternal(vault)
    try {
      await go('/bookmarks')
      await win
        .locator('[data-slot="page-header"]')
        .getByRole('button', { name: 'Закладка' })
        .click()
      const pane = win.locator('[data-detail-mode]').first()
      await expect(pane).toHaveAttribute('data-detail-mode', 'edit')
      const id = (await openParam(win))!
      expect(id).toBeTruthy()
      await win.getByRole('textbox', { name: 'Назва', exact: true }).fill(`Стаття ${token}`)
      const link = win.getByRole('textbox', { name: 'Посилання' })
      await link.fill(typed)
      // Not an error: a bare domain is a link, the scheme is added on save.
      await expect(link).not.toHaveAttribute('aria-invalid', 'true')
      await expect.poll(async () => (await rpc('bookmarks.get', id)).url).toBe(`https://${typed}`)
      await pane.locator('[data-save]').click()
      await expect(pane).toHaveAttribute('data-detail-mode', 'view')

      // Reading: the link shows with its scheme and opens as https://.
      const shown = pane.getByRole('button', { name: `https://${typed}` })
      await expect(shown).toBeVisible()
      await shown.click()
      await expect.poll(stub.opened).toEqual([`https://${typed}`])
      await pane.getByRole('button', { name: 'Відкрити', exact: true }).click()
      await expect.poll(stub.opened).toEqual([`https://${typed}`, `https://${typed}`])
    } finally {
      await stub.restore()
    }
  })

  test('не посилання («просто текст») — помилка біля поля, нічого не зберігається', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const b = await rpc('bookmarks.create', {
      title: `Курс ${uid()}`,
      url: 'https://example.com/a'
    })
    await go(`/bookmarks?open=${b.id}`)
    const pane = win.locator('[data-detail-mode]').first()
    await pane.locator('[data-edit-detail]').click()
    const link = win.getByRole('textbox', { name: 'Посилання' })
    await link.fill('просто текст')
    await expect(link).toHaveAttribute('aria-invalid', 'true')
    await link.blur()
    // The old link stays on the server while the field is invalid.
    await expect
      .poll(async () => (await rpc('bookmarks.get', b.id)).url)
      .toBe('https://example.com/a')
    await pane.getByRole('button', { name: 'Скасувати' }).click()
    await expect(pane).toHaveAttribute('data-detail-mode', 'view')
    await expect(pane.getByRole('button', { name: 'https://example.com/a' })).toBeVisible()
  })
})
