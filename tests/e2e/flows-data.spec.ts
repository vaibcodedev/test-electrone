import type { Locator, Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, test, uid, type Vault } from './fixtures'

/**
 * Cross-cutting flows (docs/quality-pass.md §6): links and jumping by a link, pins and favourites on the
 * dashboard, «Імпорт з JSON», export and backup. OS dialogs are stubbed in the main process, so export and
 * backup run without a window to click.
 */

const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()
const openParam = (win: Page): Promise<string | null> =>
  win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))
const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const pinnedCard = (win: Page): Locator =>
  win.locator('[data-slot="card"]').filter({ has: win.getByText('Закріплено', { exact: true }) })

/** Replaces Electron's save/message dialogs in main for the rest of the worker (originals are kept once). */
async function stubDialogs(vault: Vault, savePath: string): Promise<void> {
  await vault.app.evaluate(({ dialog }, path) => {
    const g = globalThis as unknown as { __vaultDialogs?: Record<string, unknown> }
    g.__vaultDialogs ??= { save: dialog.showSaveDialog, box: dialog.showMessageBox }
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: path
    })) as typeof dialog.showSaveDialog
    // «Поточні дані буде замінено…» → «Відновити» (button 0).
    dialog.showMessageBox = (async () => ({
      response: 0,
      checkboxChecked: false
    })) as typeof dialog.showMessageBox
  }, savePath)
}

async function restoreDialogs(vault: Vault): Promise<void> {
  await vault.app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __vaultDialogs?: Record<string, unknown> }
    if (!g.__vaultDialogs) return
    dialog.showSaveDialog = g.__vaultDialogs.save as typeof dialog.showSaveDialog
    dialog.showMessageBox = g.__vaultDialogs.box as typeof dialog.showMessageBox
  })
}

test.describe('зв’язки між записами', () => {
  test('«Зв’язати» з пошуку → зв’язок видно з обох боків → перехід → прибрати', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const token = `lk${uid()}`
    const idea = await rpc('ideas.create', { title: `Ідея ${token}` })
    const note = await rpc('notes.create', { title: `Нотатка про ${token}`, body: 'Подробиці' })

    await go(`/ideas?open=${idea.id}`)
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await pane(win).getByRole('button', { name: 'Зв’язати' }).click()
    const picker = win.locator('[data-slot="popover-content"]')
    await picker.getByPlaceholder('Знайти будь-що…').fill(`Нотатка про ${token}`)
    // The record itself is never offered.
    await expect(picker.getByRole('option', { name: new RegExp(note.title) })).toBeVisible()
    await expect(picker.getByRole('option', { name: new RegExp(`^Ідея ${token}`) })).toHaveCount(0)
    await picker.getByRole('option', { name: new RegExp(note.title) }).click()
    await expect(win.getByText('Зв’язок додано')).toBeVisible()

    const linkRow = pane(win).getByRole('button', { name: new RegExp(note.title) })
    await expect(linkRow).toBeVisible()
    expect(
      (await rpc('links.list', { type: 'idea', id: idea.id })).map((l: { id: string }) => l.id)
    ).toEqual([note.id])

    // Jump by the link → the note opens; the link back to the idea is there.
    await linkRow.click()
    await expect.poll(() => hashPath(win)).toBe('/notes')
    await expect.poll(() => openParam(win)).toBe(note.id)
    await expect(win.getByRole('heading', { name: note.title })).toBeVisible()
    const back = pane(win).getByRole('button', { name: new RegExp(idea.title) })
    await expect(back).toBeVisible()

    // Unlink from the note side; the idea loses it too.
    await back.hover()
    await back.getByRole('button', { name: 'Прибрати зв’язок' }).click()
    await expect(back).toHaveCount(0)
    await expect
      .poll(async () => (await rpc('links.list', { type: 'idea', id: idea.id })).length)
      .toBe(0)
  })

  test('зв’язок з записом у кошику зникає й повертається разом із ним', async ({ vault }) => {
    const { win, rpc, go } = vault
    const idea = await rpc('ideas.create', { title: `Ідея з зв’язком ${uid()}` })
    const note = await rpc('notes.create', { title: `Пов’язана нотатка ${uid()}` })
    await rpc('links.create', { fromType: 'idea', fromId: idea.id, toType: 'note', toId: note.id })

    await rpc('notes.remove', note.id)
    await go(`/ideas?open=${idea.id}`)
    await expect(win.getByRole('heading', { name: idea.title })).toBeVisible()
    await expect(pane(win).getByRole('button', { name: new RegExp(note.title) })).toHaveCount(0)

    await rpc('trash.restore', { type: 'note', id: note.id })
    await expect(pane(win).getByRole('button', { name: new RegExp(note.title) })).toBeVisible()
  })
})

test.describe('закріплене й обране', () => {
  test('шпилька — на головну, зірка — першим у розділі з позначкою, чип «Обране» й група в Ctrl+K', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    // Only our records on the dashboard card (it shows up to 7) and in «Обране».
    for (const kind of ['pin', 'favorite'] as const)
      for (const p of await rpc('pins.list', kind))
        await rpc('pins.toggle', { ref: { type: p.type, id: p.id }, kind })

    const pinned = await rpc('ideas.create', { title: `Закріплена ${uid()}` })
    const starred = await rpc('notes.create', { title: `Обрана ${uid()}`, body: 'текст' })
    // A newer note: without ★ it would be the first row.
    const newer = await rpc('notes.create', { title: `Свіжа ${uid()}`, body: 'текст' })
    const starRef = { type: 'note', id: starred.id }
    try {
      await go(`/ideas?open=${pinned.id}`)
      const pin = pane(win).getByRole('button', { name: 'Закріпити на головній' })
      await expect(pin).toHaveAttribute('aria-pressed', 'false')
      await pin.click()
      await expect(win.getByText('Закріплено на головній')).toBeVisible()
      await expect(pin).toHaveAttribute('aria-pressed', 'true')

      await go(`/notes?open=${starred.id}`)
      const star = pane(win).getByRole('button', { name: 'В обране' })
      await star.click()
      await expect(win.getByText('Додано в обране')).toBeVisible()
      await expect(win.getByText('Тепер запис першим у своєму розділі')).toBeVisible()
      await expect(star).toHaveAttribute('aria-pressed', 'true')
      expect(await rpc('pins.state', starRef)).toEqual({ pin: false, favorite: true })

      // ★ → the first row of «Нотатки», marked.
      const firstRow = win.locator('[data-index="0"]').first()
      await expect(firstRow).toContainText(starred.title)
      await expect(firstRow.getByRole('img', { name: 'В обраному' })).toBeVisible()

      // The chip leaves only favourites; a second click brings the rest back.
      const chip = win.getByRole('button', { name: 'Обране', exact: true })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await expect(win.getByText(newer.title)).toHaveCount(0)
      await chip.click()
      await expect(win.getByText(newer.title)).toBeVisible()

      // «Закріплено» on the home page is pins only.
      await go('/')
      const card = pinnedCard(win)
      await expect(card.getByText(pinned.title)).toBeVisible()
      await expect(card.getByText(starred.title)).toHaveCount(0)
      await card.getByText(pinned.title).click()
      await expect.poll(() => hashPath(win)).toBe('/ideas')
      await expect.poll(() => openParam(win)).toBe(pinned.id)

      // Ctrl+K without a query: the «Обране» group.
      await win.keyboard.press('Control+k')
      const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
      const favGroup = palette.locator('[cmdk-group]', {
        has: win.locator('[cmdk-group-heading]', { hasText: /^Обране$/ })
      })
      await expect(favGroup.getByRole('option', { name: new RegExp(starred.title) })).toBeVisible()
      await win.keyboard.press('Escape')
      await expect(palette).toBeHidden()

      // Unstar / unpin → no mark, no chip, an empty dashboard card.
      await go(`/notes?open=${starred.id}`)
      await pane(win).getByRole('button', { name: 'В обране' }).click()
      await expect(win.getByText('Прибрано з обраного')).toBeVisible()
      await expect(win.getByRole('img', { name: 'В обраному' })).toHaveCount(0)
      await expect(win.getByRole('button', { name: 'Обране', exact: true })).toHaveCount(0)
      await go(`/ideas?open=${pinned.id}`)
      await pane(win).getByRole('button', { name: 'Закріпити на головній' }).click()
      await expect(win.getByText('Відкріплено з головної')).toBeVisible()
      await go('/')
      await expect(pinnedCard(win).getByText('Натисніть шпильку в будь-якому записі')).toBeVisible()
    } finally {
      // A forgotten ★ would put this note first in other tests' lists.
      if ((await rpc('pins.state', starRef)).favorite)
        await rpc('pins.toggle', { ref: starRef, kind: 'favorite' })
      if ((await rpc('pins.state', { type: 'idea', id: pinned.id })).pin)
        await rpc('pins.toggle', { ref: { type: 'idea', id: pinned.id }, kind: 'pin' })
    }
  })

  test('закріплений запис у кошику зникає з головної', async ({ vault }) => {
    const { win, rpc, go } = vault
    const idea = await rpc('ideas.create', { title: `Закріплена й видалена ${uid()}` })
    await rpc('pins.toggle', { ref: { type: 'idea', id: idea.id }, kind: 'pin' })
    await go('/')
    await expect(pinnedCard(win).getByText(idea.title)).toBeVisible()
    await rpc('ideas.remove', idea.id)
    await expect(pinnedCard(win).getByText(idea.title)).toHaveCount(0)
    await rpc('trash.restore', { type: 'idea', id: idea.id })
    await expect(pinnedCard(win).getByText(idea.title)).toBeVisible()
    await rpc('pins.toggle', { ref: { type: 'idea', id: idea.id }, kind: 'pin' })
  })
})

test.describe('імпорт з JSON', () => {
  test('ідеї: помилки зрозумілі, прев’ю, «Імпортувати 2» → перша відкрита, обидві знаходяться', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const token = `im${uid()}`
    await go('/ideas')
    await win.getByRole('button', { name: 'Імпорт з JSON' }).click()
    const dialog = win.getByRole('dialog', { name: /Імпорт з JSON/ })
    await expect(dialog).toBeVisible()
    const text = dialog.getByRole('textbox', { name: 'JSON для імпорту' })
    const submit = dialog.getByRole('button', { name: /^Імпортувати/ })

    await text.fill('це не json')
    await expect(dialog.getByText(/Це не схоже на JSON/)).toBeVisible()
    await expect(submit).toBeDisabled()

    // Valid JSON, wrong shape: an error in Ukrainian, still disabled.
    await text.fill('[{"body": "без назви"}]')
    await expect(dialog.locator('.text-destructive')).toBeVisible()
    await expect(submit).toBeDisabled()

    // An AI answer with text and ```json fences around the array is accepted.
    await text.fill(
      `Ось ідеї:\n\`\`\`json\n${JSON.stringify([
        { title: `Перша ${token}`, body: 'Опис', status: 'inbox', impact: 2 },
        { title: `Друга ${token}` }
      ])}\n\`\`\`\nУдачі!`
    )
    await expect(dialog.getByText(/Готово до імпорту: 2/)).toBeVisible()
    await expect(dialog.locator('[data-slot="badge"]', { hasText: `Перша ${token}` })).toBeVisible()
    await expect(submit).toHaveText('Імпортувати 2')
    await submit.click()

    await expect(dialog).toBeHidden()
    await expect(win.getByText(/Імпортовано 2/)).toBeVisible()
    const found = await rpc('ideas.list', { search: token })
    expect(found.map((i: { title: string }) => i.title).sort()).toEqual([
      `Друга ${token}`,
      `Перша ${token}`
    ])
    const first = found.find((i: { title: string }) => i.title === `Перша ${token}`)
    expect(first.impact).toBe(2)
    await expect.poll(() => openParam(win)).toBe(first.id)
    await expect(win.getByRole('heading', { name: `Перша ${token}` })).toBeVisible()
  })

  test('«Вставити приклад» дає валідний JSON, «Скасувати» нічого не імпортує', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const before = (await rpc('ideas.list', { limit: 1000 })).length
    await go('/ideas')
    await win.getByRole('button', { name: 'Імпорт з JSON' }).click()
    const dialog = win.getByRole('dialog', { name: /Імпорт з JSON/ })
    await dialog.getByRole('button', { name: 'Вставити приклад' }).click()
    await expect(dialog.getByText(/Готово до імпорту: 1/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Скасувати' }).click()
    await expect(dialog).toBeHidden()
    expect((await rpc('ideas.list', { limit: 1000 })).length).toBe(before)
  })
})

test.describe('експорт і бекап', () => {
  let dir = ''
  test.beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'vault-e2e-export-'))
  })
  test.afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }))
  test.afterEach(async ({ vault }) => restoreDialogs(vault))

  test('експорт у JSON містить свіжий запис, але не секрети доступів', async ({ vault }) => {
    const { rpc } = vault
    const token = `ex${uid()}`
    const idea = await rpc('ideas.create', { title: `Експорт ${token}` })
    const project = await rpc('projects.create', { title: `Доступи ${token}` })
    await rpc('credentials.create', {
      projectId: project.id,
      label: 'FTP',
      login: 'user',
      secret: `s3cret-${token}`
    })
    const file = join(dir, 'export.json')
    await stubDialogs(vault, file)

    expect(await rpc('backup.export', 'json')).toBe(file)
    const json = JSON.parse(readFileSync(file, 'utf8'))
    expect(json.format).toBe('vault-export')
    expect(json.tables.ideas.map((r: { id: string }) => r.id)).toContain(idea.id)
    expect(readFileSync(file, 'utf8')).not.toContain(`s3cret-${token}`)
  })

  test('експорт у Markdown — zip з README і теками модулів', async ({ vault }) => {
    const file = join(dir, 'export.zip')
    await stubDialogs(vault, file)
    expect(await vault.rpc('backup.export', 'markdown')).toBe(file)
    const bytes = readFileSync(file)
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(bytes.includes(Buffer.from('README.md'))).toBe(true)
  })

  test('«Зробити бекап зараз» → файл у списку → відновлення повертає дані на момент бекапу', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, rpcRaw, go } = vault
    const token = `bk${uid()}`
    const kept = await rpc('ideas.create', { title: `До бекапу ${token}` })
    const before = (await rpc('backup.list')).length

    await go('/settings')
    await win.getByRole('button', { name: 'Зробити бекап зараз' }).click()
    await expect(win.getByText('Бекап створено')).toBeVisible()
    const list = await rpc('backup.list')
    expect(list.length).toBe(before + 1)
    const backup = list[0]
    expect(existsSync(backup.path)).toBe(true)
    expect(statSync(backup.path).size).toBeGreaterThan(0)

    // Changes after the backup: one more idea, the kept one renamed.
    const lost = await rpc('ideas.create', { title: `Після бекапу ${token}` })
    await rpc('ideas.update', { id: kept.id, patch: { title: `Перейменована ${token}` } })

    await stubDialogs(vault, join(dir, 'unused.vaultbak'))
    // The window reloads during restore: the call may die with the page.
    await rpcRaw('backup.restore', { path: backup.path }).catch(() => undefined)
    await win.waitForLoadState('domcontentloaded')
    await win.waitForFunction(
      () => typeof (window as unknown as { vault?: { rpc?: unknown } }).vault?.rpc === 'function'
    )

    await expect
      .poll(async () => (await rpc('ideas.get', kept.id))?.title)
      .toBe(`До бекапу ${token}`)
    expect(await rpc('ideas.get', lost.id)).toBeNull()
    // A safety copy of the state before restoring was made.
    expect(
      (await rpc('backup.list')).some((b: { fileName: string }) =>
        b.fileName.includes('pre-restore')
      )
    ).toBe(true)
    await go('/ideas')
    await win.locator('[data-page-search]').fill(token)
    await expect(win.getByText(`До бекапу ${token}`)).toBeVisible()
    await expect(win.getByText(`Після бекапу ${token}`)).toHaveCount(0)
  })
})

test.describe('сховище', () => {
  test('журнал тестового запуску лежить у його userData, не в робочому Vault', async ({
    vault
  }) => {
    const userData = await vault.app.evaluate(({ app }) => app.getPath('userData'))
    const info = await vault.rpc('settings.info')
    expect(info.logFile.toLowerCase().startsWith(join(userData, 'logs').toLowerCase())).toBe(true)
  })

  test('розділ «Сховище» показує розміри', async ({ vault }) => {
    const { win, rpc, go } = vault
    await go('/settings#storage')
    await expect(win.locator('#storage').getByText('Сховище', { exact: true })).toBeVisible()
    const usage = await rpc('storage.usage')
    expect(usage.total).toBeGreaterThan(0)
    expect(usage.database.bytes).toBeGreaterThan(0)
  })

  test('«Очистити кеш» не чіпає записи, налаштування й localStorage', async ({ vault }) => {
    const { win, rpc, go } = vault
    const token = `cc${uid()}`
    const idea = await rpc('ideas.create', { title: `Ідея ${token}` })
    const settings = await rpc('settings.get')
    await go('/settings#storage')
    await win.evaluate(() => localStorage.setItem('vault-rate-calc', '{"x":1}'))
    await win.locator('#storage').getByRole('button', { name: 'Очистити кеш' }).click()
    await expect(win.getByText(/Кеш очищено|Кеш уже порожній/)).toBeVisible()
    expect(await win.evaluate(() => localStorage.getItem('vault-rate-calc'))).toBe('{"x":1}')
    expect(await rpc('settings.get')).toEqual(settings)
    expect((await rpc('ideas.get', idea.id))?.title).toBe(`Ідея ${token}`)
  })

  test('«Видалити старі» бекапи: з підтвердженням, лишає backupKeep', async ({ vault }) => {
    const { win, rpc, go } = vault
    const { backupKeep } = await rpc('settings.get')
    try {
      // create() trims to backupKeep itself: extra copies appear only once the limit goes down.
      await rpc('settings.update', { backupKeep: 5 })
      for (let i = 0; i < 3; i++) await rpc('backup.create', { saveAs: false })
      await rpc('settings.update', { backupKeep: 1 })
      await go('/settings#storage')
      const prune = win.locator('#storage').getByRole('button', { name: 'Видалити старі бекапи' })
      await expect(prune).toBeEnabled()
      await prune.click()
      const dialog = win.getByRole('alertdialog')
      await expect(dialog.getByText('Видалити старі бекапи?')).toBeVisible()
      await dialog.getByRole('button', { name: 'Видалити' }).click()
      await expect(win.getByText(/Старі бекапи видалено/)).toBeVisible()
      const regular = (await rpc('backup.list')).filter(
        (b: { fileName: string }) => !b.fileName.includes('pre-restore')
      )
      expect(regular).toHaveLength(1)
      await expect(prune).toBeDisabled()
    } finally {
      await rpc('settings.update', { backupKeep })
    }
  })

  test('невідома папка — помилка, а не відкриття', async ({ vault }) => {
    const r = await vault.rpcRaw('storage.openFolder', { folder: 'nope' })
    expect(r.ok).toBe(false)
  })
})
