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

    // The design is a dialog over the gallery: Esc closes the «У добірку» popover if it is still open, then the
    // dialog itself; «Скинути колір» brings the rest back.
    const dialog = win.getByRole('dialog')
    await expect(async () => {
      await win.keyboard.press('Escape')
      await expect(dialog).toBeHidden({ timeout: 500 })
    }).toPass()
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

  // Regression: «Зберегти» on a new board left it an «empty draft» (default title, never edited, nothing in it):
  // leaving the page discarded it and the next «Нова добірка» reused it, though the toast said «Збережено».
  test('«Нова добірка» → «Зберегти» без змін → добірка лишається; наступна — нова', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const drafts = async (): Promise<number> =>
      ((await rpc('moodboards.list', {})) as { title: string }[]).filter(
        (m) => m.title === 'Нова добірка'
      ).length
    const before = await drafts()
    for (let i = 1; i <= 2; i++) {
      await go('/designs')
      await win.getByRole('button', { name: 'Нова добірка', exact: true }).click()
      await expect.poll(() => hashPath(win)).toMatch(/^\/designs\/boards\//)
      await win.locator('[data-save]').click()
      await expect(win.getByText('Збережено').first()).toBeVisible()
      await go('/designs')
      // Leaving discards an empty draft after a short delay (hooks/use-discard-draft.ts): wait past it.
      await win.waitForTimeout(1500)
      await expect.poll(drafts).toBe(before + i)
    }
  })
})

/** Live moodboards to the trash; returns a restore for the end of the test (the worker's base is shared). */
async function trashAllBoards(rpc: Vault['rpc']): Promise<() => Promise<void>> {
  const ids = ((await rpc('moodboards.list', {})) as { id: string }[]).map((b) => b.id)
  for (const id of ids) await rpc('moodboards.remove', id)
  return async () => {
    for (const id of ids) await rpc('trash.restore', { type: 'moodboard', id })
  }
}

test.describe('дизайни: ряд добірок', () => {
  // The user's complaint: with no boards «Нова добірка» was a lone dashed pill over the filters, and closing a
  // new untouched board silently brought the same pill back.
  test('0 добірок — один рядок із кнопкою; нова добірка без змін → «Запис не створено»', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const restore = await trashAllBoards(rpc)
    try {
      await go('/designs')
      const text = win.getByText('Добірок поки немає', { exact: true })
      const button = win.getByRole('button', { name: 'Нова добірка', exact: true })
      await expect(text).toBeVisible()
      await expect(button).toBeVisible()
      const b = (await button.boundingBox())!
      const t = (await text.boundingBox())!
      expect(b.height).toBeLessThanOrEqual(34)
      expect(Math.abs(b.y + b.height / 2 - (t.y + t.height / 2))).toBeLessThanOrEqual(4)
      await expect(win.locator('header [class*="border-dashed"]')).toHaveCount(0)

      await button.click()
      await expect.poll(() => hashPath(win)).toMatch(/^\/designs\/boards\//)
      await expect(win.locator('[data-save]')).toBeVisible()
      await win.getByRole('button', { name: 'Закрити' }).click()
      await expect(win.getByText('Запис не створено').first()).toBeVisible()
      await expect.poll(() => hashPath(win)).toBe('/designs')
      await expect(text).toBeVisible()
      expect(await rpc('moodboards.count')).toBe(0)
    } finally {
      await restore()
    }
  })

  // With no boards the «У добірку» popup had a lone separator on top and never said «Добірок поки немає.»
  // (cmdk shows Empty only when nothing matches, and «Нова добірка» always does); a gallery search hid the row.
  test('0 добірок: пошук у галереї не ховає «Нова добірка»; «У добірку» каже, що добірок немає, і створює нову', async ({
    vault
  }) => {
    test.setTimeout(60_000)
    const { win, rpc, go } = vault
    const design = await importSolidImage(win, `solo-${uid()}`, '#00a0ff')
    const restore = await trashAllBoards(rpc)
    let created: string | undefined
    try {
      await go('/designs')
      const newBoard = win.getByRole('button', { name: 'Нова добірка', exact: true })
      await expect(newBoard).toBeVisible()
      await win.locator('[data-page-search]').fill('нічого-такого-немає')
      await expect(newBoard).toBeVisible()
      await win.locator('[data-page-search]').fill('')

      await go(`/designs?open=${design.id}`)
      await win.getByRole('button', { name: 'У добірку' }).click()
      const popup = win.locator('[data-slot="popover-content"]')
      await expect(popup.getByText('Добірок поки немає.', { exact: true })).toBeVisible()
      await expect(popup.locator('[data-slot="command-separator"]')).toHaveCount(0)
      await popup.getByRole('option', { name: 'Нова добірка' }).click()
      await expect(win.getByText('Дизайн додано в «Нова добірка»').first()).toBeVisible()
      await expect.poll(() => rpc('moodboards.count')).toBe(1)
      created = ((await rpc('moodboards.list', {})) as { id: string }[])[0].id
      expect((await rpc('moodboards.details', created))?.designs?.length).toBe(1)
    } finally {
      if (created) await rpc('moodboards.remove', created)
      await rpc('designs.remove', design.id)
      await restore()
    }
  })

  test('згорнутий ряд лишається згорнутим після переходу й перезапуску', async ({ vault }) => {
    const { win, rpc, go } = vault
    const board = await rpc('moodboards.create', { title: `Згортання ${uid()}` })
    const trigger = win.getByRole('button', { name: /^Добірки \d+$/ })
    try {
      await go('/designs')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await expect(win.locator('[data-slot="strip-item"]').first()).toBeVisible()
      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(win.locator('[data-slot="strip-item"]')).toHaveCount(0)
      // Collapsed, the way to every board stays.
      await expect(win.getByRole('button', { name: 'Усі добірки', exact: true })).toBeVisible()

      await go('/ideas')
      await go('/designs')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await win.reload()
      await win.waitForLoadState('domcontentloaded')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    } finally {
      // localStorage is shared by the worker's tests: leave the row expanded.
      await win.evaluate(() => {
        const raw = localStorage.getItem('vault-ui')
        if (!raw) return
        const saved = JSON.parse(raw)
        if (saved.state?.collapsed) saved.state.collapsed['designs.moodboards'] = false
        localStorage.setItem('vault-ui', JSON.stringify(saved))
      })
      await rpc('moodboards.remove', board.id)
    }
  })

  test('30 добірок: 12 у ряду + «ще N», стрілки гортають, «Усі добірки» шукає й відкриває', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = uid()
    const ids: string[] = []
    for (let i = 0; i < 30; i++)
      ids.push((await rpc('moodboards.create', { title: `Ряд ${token} ${i}` })).id)
    try {
      const total: number = await rpc('moodboards.count')
      await go('/designs')
      const items = win.locator('[data-slot="strip-item"]')
      await expect(items).toHaveCount(13)
      await expect(win.getByRole('button', { name: `Усі добірки: ще ${total - 12}` })).toBeVisible()

      const next = win.getByRole('button', { name: 'Наступні добірки' })
      await expect(next).toBeEnabled()
      await expect(items.first()).toBeInViewport()
      await next.click()
      await expect(items.first()).not.toBeInViewport()
      await expect(win.getByRole('button', { name: 'Попередні добірки' })).toBeEnabled()

      await win.getByRole('button', { name: 'Усі добірки', exact: true }).click()
      const dialog = win.getByRole('dialog', { name: 'Усі добірки' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('searchbox', { name: 'Пошук добірок' }).fill(`Ряд ${token} 7`)
      const found = dialog.locator('[data-slot="card"]')
      await expect(found).toHaveCount(1)
      await found.click()
      await expect.poll(() => hashPath(win)).toBe(`/designs/boards/${ids[7]}`)
      await expect(dialog).toBeHidden()
    } finally {
      for (const id of ids) await rpc('moodboards.remove', id)
    }
  })

  test('обрана добірка — перша в ряду, із зірочкою', async ({ vault }) => {
    const { win, rpc, go } = vault
    // Not empty: favourite boards with designs go before empty favourites (the seed has «Лайм и графит»),
    // and among them the last changed one is first.
    const design = await importSolidImage(win, `fav-${uid()}`, '#22aa66')
    const board = await rpc('moodboards.create', { title: `Обрана ${uid()}` })
    const ref = { type: 'moodboard', id: board.id }
    try {
      await rpc('moodboards.addDesigns', { moodboardId: board.id, designIds: [design.id] })
      await go(`/designs/boards/${board.id}`)
      await win.getByRole('button', { name: 'В обране' }).click()
      await expect.poll(async () => (await rpc('pins.state', ref)).favorite).toBe(true)
      await go('/designs')
      const first = win.locator('[data-slot="strip-item"]').first()
      await expect(first).toContainText(board.title)
      await expect(first).toContainText('В обраному')
    } finally {
      if ((await rpc('pins.state', ref)).favorite)
        await rpc('pins.toggle', { ref, kind: 'favorite' })
      await rpc('moodboards.remove', board.id)
      await rpc('designs.remove', design.id)
    }
  })

  test('плитка дизайну: смужка палітри замість кружків; знімок без назви підписано датою', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    // «clipboard.png» is what a pasted screenshot is called: main stores it without a title.
    const shot = await importSolidImage(win, 'clipboard', '#3366ff')
    expect(shot.title).toBe('')
    try {
      await go('/designs')
      const tile = win
        .locator('[data-slot="card"]')
        .filter({ hasText: /Знімок .+ о \d{2}:\d{2}/ })
        .first()
      await expect(tile).toBeVisible()
      await expect(tile.locator('[data-slot="palette-strip"]')).toHaveCount(1)
      await expect(win.locator('[data-slot="card"] [role="switch"]')).toHaveCount(0)
      await expect(win.getByText('Без назви')).toHaveCount(0)
    } finally {
      await rpc('designs.remove', shot.id)
    }
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

test.describe('добірка: дизайн відкривається на місці', () => {
  test('клік по дизайну відкриває вікно поверх добірки; Esc лишає на добірці', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const token = uid()
    const design = await importSolidImage(win, `onboard-${token}`, '#6f7ff0')
    const board = await rpc('moodboards.create', { title: `Клік ${token}` })
    await rpc('moodboards.addDesigns', { moodboardId: board.id, designIds: [design.id] })

    await go(`/designs/boards/${board.id}`)
    // A plain click, no hold: dnd starts only after 6px of movement.
    await win
      .locator('[data-slot="card"]')
      .filter({ has: win.locator('img') })
      .first()
      .click()
    const dialog = win.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: design.title })).toBeVisible()
    await expect.poll(() => hashPath(win)).toBe(`/designs/boards/${board.id}`)
    await expect.poll(() => openParam(win)).toBe(design.id)

    await win.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect.poll(() => hashPath(win)).toBe(`/designs/boards/${board.id}`)
  })
})

test.describe('вставка з буфера', () => {
  test('Ctrl+V показує превью: «Скасувати» нічого не додає, «Додати в галерею» — додає', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const count = async (): Promise<number> => ((await rpc('designs.list', {})) as unknown[]).length
    await go('/designs')
    const paste = (): Promise<void> =>
      win.evaluate(async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 400
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#e8930c'
        ctx.fillRect(0, 0, 640, 400)
        const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
        const dt = new DataTransfer()
        dt.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }))
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }))
      })
    const before = await count()
    const dialog = win.getByRole('dialog', { name: 'Додати картинку?' })

    await paste()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('640 × 400')
    await dialog.getByRole('button', { name: 'Скасувати' }).click()
    await expect(dialog).toBeHidden()
    expect(await count()).toBe(before)

    await paste()
    await dialog.getByRole('button', { name: 'Додати в галерею' }).click()
    await expect.poll(count).toBe(before + 1)
  })
})

test.describe('добірка: зв’язки поруч із дизайнами', () => {
  test('«Показати ще» перебудовує сітку одним кроком, без проміжного кадру', async ({ vault }) => {
    const { win, go, rpc } = vault
    await win.setViewportSize({ width: 1400, height: 900 })
    const ids: string[] = await win.evaluate(async () => {
      const out: string[] = []
      for (let i = 0; i < 10; i++) {
        const c = document.createElement('canvas')
        c.width = 400
        c.height = 300
        const x = c.getContext('2d')!
        x.fillStyle = ['#f4f4f0', '#335533', '#6f7ff0', '#e8930c', '#555', '#d4f542'][i % 6]
        x.fillRect(0, 0, 400, 300)
        const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (window as any).vault.rpc('designs.importImage', {
          source: {
            kind: 'bytes',
            name: `vt ${i}.png`,
            mime: 'image/png',
            data: new Uint8Array(await blob.arrayBuffer())
          }
        })
        out.push(res.data.id)
      }
      return out
    })
    const board = await rpc('moodboards.create', { title: 'VT' })
    await rpc('moodboards.addDesigns', { moodboardId: board.id, designIds: ids })
    for (const id of ids)
      await rpc('links.create', {
        fromType: 'moodboard',
        fromId: board.id,
        toType: 'design',
        toId: id
      })
    await go(`/designs/boards/${board.id}`)
    await expect(win.getByRole('button', { name: /Показати ще/ })).toBeVisible()
    // Tile positions sampled after each painted frame for 0.7 s: the old layout, then the new one — no frame
    // in between with rows stretched by the taller aside (the «blinking» of every picture).
    const moves = await win.evaluate(async () => {
      const tile = (): string =>
        [...document.querySelectorAll('[data-slot="card"]')]
          .map((e) => {
            const r = e.getBoundingClientRect()
            return `${Math.round(r.x)},${Math.round(r.y)}`
          })
          .join('|')
      const frame = (): Promise<void> =>
        new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
      // Start from a settled page: pictures and the aside may still be landing right after navigation.
      let last = tile()
      for (let calm = performance.now(); performance.now() - calm < 300;) {
        await frame()
        const now = tile()
        if (now !== last) {
          last = now
          calm = performance.now()
        }
      }
      const seen: string[] = ['start ' + last]
      ;(
        [...document.querySelectorAll('button')].find((b) =>
          b.textContent?.startsWith('Показати ще')
        ) as HTMLButtonElement
      ).click()
      const t0 = performance.now()
      while (performance.now() - t0 < 700) {
        await frame()
        const now = tile()
        if (now !== last) {
          last = now
          seen.push(`${Math.round(performance.now() - t0)}ms ` + now)
        }
      }
      return seen
    })
    expect(moves.length - 1).toBeLessThanOrEqual(1)
  })
})

test.describe('ряд добірок', () => {
  test('мишею: перетягування й колесо гортають ряд, а клік після перетягування не відкриває добірку', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    await win.setViewportSize({ width: 1200, height: 800 })
    for (let i = 0; i < 12; i++) await rpc('moodboards.create', { title: `Ряд ${i} ${uid()}` })
    await go('/designs')
    const row = win
      .locator('[data-slot="strip-item"]')
      .first()
      .locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]')
    await expect(row).toBeVisible()
    const left = (): Promise<number> => row.evaluate((el) => el.scrollLeft)
    expect(await left()).toBe(0)

    const box = (await row.boundingBox())!
    const y = box.y + box.height / 2
    await win.mouse.move(box.x + box.width - 60, y)
    await win.mouse.down()
    await win.mouse.move(box.x + box.width - 260, y, { steps: 8 })
    await win.mouse.move(box.x + box.width - 460, y, { steps: 8 })
    await win.mouse.up()
    await expect.poll(left).toBeGreaterThan(200)
    // The drag ended over a tile: it stays a drag, the board doesn't open.
    await win.waitForTimeout(300)
    await expect.poll(() => hashPath(win)).toBe('/designs')

    const before = await left()
    await win.mouse.move(box.x + box.width / 2, y)
    await win.mouse.wheel(0, 300)
    await expect.poll(left).toBeGreaterThan(before)
  })
})

test.describe('відео в дизайні', () => {
  test('свій плеєр: клік по шкалі перемотує, гучність рухається — і в режимі перегляду', async ({
    vault
  }) => {
    const { win, go } = vault
    const id: string = await win.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 320
      c.height = 180
      const x = c.getContext('2d')!
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' })
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.start()
      for (let i = 0; i < 60; i++) {
        x.fillStyle = `hsl(${i * 6},70%,50%)`
        x.fillRect(0, 0, 320, 180)
        await new Promise((r) => setTimeout(r, 33))
      }
      rec.stop()
      await new Promise((r) => (rec.onstop = r))
      const data = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (window as any).vault.rpc('designs.importImage', {
        source: { kind: 'bytes', name: 'clip.webm', mime: 'video/webm', data }
      })
      return res.data.id as string
    })
    await go(`/designs?open=${id}`)
    const dialog = win.getByRole('dialog')
    await expect(dialog.locator('[data-detail-mode="view"]').first()).toBeVisible()
    const video = dialog.locator('video')
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThan(0)

    const position = dialog.getByRole('slider', { name: 'Позиція у відео' })
    await expect(position).toBeEnabled()
    const track = position.locator('xpath=ancestor::*[@data-slot="slider"][1]')
    const box = (await track.boundingBox())!
    await win.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2)
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.2)

    const volume = dialog.getByRole('slider', { name: 'Гучність' })
    await volume.focus()
    await win.keyboard.press('ArrowLeft')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.volume)).toBeLessThan(1)
  })
})
