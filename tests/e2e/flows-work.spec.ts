import type { Locator, Page } from '@playwright/test'
import { DAY, expect, test, uid } from './fixtures'

/**
 * Work flows (docs/quality-pass.md §6): time tracking on a project, calendar events with a repeat,
 * conversions idea → board and proposal → contract / template. Driven through the UI; RPC prepares data
 * and checks the result.
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const openParam = (win: Page): Promise<string | null> =>
  win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))
const dayLabel = (d: Date): string =>
  new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' }).format(d)
/** A month-grid cell, found by its «Нова подія <d MMMM>» button. */
const dayCell = (win: Page, d: Date): Locator =>
  win
    .locator('[data-slot="card"]')
    .filter({ has: win.getByRole('button', { name: `Нова подія ${dayLabel(d)}`, exact: true }) })

test.describe('облік часу', () => {
  test('таймер: «Почати» → іде → «Зупинити» → запис і сума годин; «Вручну» додає до дня', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    test.skip(
      new Date().getHours() < 2,
      'the 90-minute entry would start yesterday and land in another day group'
    )
    const { win, rpc, go } = vault
    if (await rpc('time.running')) await rpc('time.stop')
    const token = `tm${uid()}`
    const project = await rpc('projects.create', {
      title: `Погодинний ${token}`,
      billing: 'hourly',
      rate: 40,
      currency: 'USD',
      budgetHours: 10
    })

    await go(`/projects/${project.id}`)
    await expect(win.getByRole('heading', { name: project.title })).toBeVisible()
    // The timer works while reading the project.
    await expect(win.locator('[data-detail-mode]').first()).toHaveAttribute(
      'data-detail-mode',
      'view'
    )
    await win.getByRole('textbox', { name: 'Над чим працюєте' }).fill(`Верстка ${token}`)
    await win.getByRole('button', { name: 'Почати' }).click()
    await expect(win.getByLabel('Таймер іде')).toBeVisible()
    const running = await rpc('time.running')
    expect(running).toMatchObject({ projectId: project.id, description: `Верстка ${token}` })
    // The dashboard knows about it too.
    expect((await rpc('app.dashboard')).timer?.projectId).toBe(project.id)

    // Pretend it has been running for 90 minutes (a stop under a minute is dropped by design). The bar's clock
    // keeps its cached start (RPC from the test does not refresh renderer queries), «Зупинити» uses the server's.
    await rpc('time.update', { id: running.id, patch: { startedAt: Date.now() - 90 * 60_000 } })
    await win.getByRole('button', { name: 'Зупинити' }).click()
    await expect(win.getByText('Час записано')).toBeVisible()
    await expect(win.getByLabel('Таймер іде')).toHaveCount(0)
    expect(await rpc('time.running')).toBeNull()

    const entries = await rpc('time.list', { projectId: project.id })
    expect(entries).toHaveLength(1)
    expect(entries[0].minutes).toBe(90)
    // The history row and a quick-start chip with the same description.
    await expect(win.getByRole('button', { name: `Верстка ${token}` })).toBeVisible()
    await expect(win.getByText(`Верстка ${token}`, { exact: true })).toHaveCount(2)
    await expect(win.getByText('1 год 30 хв').first()).toBeVisible()
    await expect(win.getByText('Відпрацьовано 15% бюджету')).toBeVisible()

    // Manual entry (edit mode): 30 minutes more → the day's total is 2 hours.
    await win.locator('[data-edit-detail]').click()
    await win.getByRole('button', { name: 'Вручну' }).click()
    const form = win
      .locator('form')
      .filter({ has: win.getByRole('button', { name: 'Додати', exact: true }) })
    await form.getByPlaceholder('Напр.: 90').fill('30')
    await form.getByPlaceholder('Напр.: Верстка кошика').fill(`Дзвінок ${token}`)
    await form.getByRole('button', { name: 'Додати', exact: true }).click()
    await expect(win.getByText('Час додано')).toBeVisible()
    await expect(win.getByText(`Дзвінок ${token}`, { exact: true }).first()).toBeVisible()
    await expect
      .poll(async () => (await rpc('time.list', { projectId: project.id })).length)
      .toBe(2)
    await expect(win.getByText('2 год', { exact: true }).first()).toBeVisible()
    await expect(win.getByText(/Відпрацьовано 20% бюджету/)).toBeVisible()
    // The entry is saved by «Додати» itself; the project's own fields didn't change, so «Зберегти» stays off and
    // Esc leaves edit mode without asking.
    await expect(win.locator('[data-save]')).toBeDisabled()
    await win.keyboard.press('Escape')
    await expect(win.locator('[data-edit-detail]')).toBeVisible()
  })

  test('новий таймер в іншому проєкті зупиняє попередній', async ({ vault }) => {
    const { win, rpc, go } = vault
    if (await rpc('time.running')) await rpc('time.stop')
    const a = await rpc('projects.create', {
      title: `Перший ${uid()}`,
      billing: 'hourly',
      rate: 10
    })
    const b = await rpc('projects.create', {
      title: `Другий ${uid()}`,
      billing: 'hourly',
      rate: 10
    })
    const started = await rpc('time.start', { projectId: a.id, description: 'Старий' })
    await rpc('time.update', { id: started.id, patch: { startedAt: Date.now() - 10 * 60_000 } })

    await go(`/projects/${b.id}`)
    await expect(
      win.getByText(`Зараз іде таймер у «${a.title}» — його буде зупинено`)
    ).toBeVisible()
    await win.getByRole('button', { name: 'Почати' }).click()
    await expect(win.getByLabel('Таймер іде')).toBeVisible()
    expect((await rpc('time.running')).projectId).toBe(b.id)
    const old = await rpc('time.list', { projectId: a.id })
    expect(old).toHaveLength(1)
    expect(old[0].endedAt).not.toBeNull()
    await rpc('time.stop')
  })
})

test.describe('календар', () => {
  test('нова подія «Щотижня» видна сьогодні й через тиждень, не завтра; відкрити й видалити', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const title = `Щотижнева ${uid()}`
    const now = new Date()
    test.skip(
      now.getHours() >= 23,
      'the new event starts at the next hour — after 23:00 that is tomorrow'
    )
    const chip = (cell: Locator, name = title): Locator => cell.locator(`[title="${name}"]`)
    // The event in a month cell — or, on a busy day (the seed's events at earlier hours come first), in its
    // «ще N» list: whether it fits in the cell depended on the time of day the test ran.
    const reveal = async (cell: Locator, name = title): Promise<Locator> => {
      if (await chip(cell, name).count()) return chip(cell, name)
      await cell.getByRole('button', { name: /^ще \d+$/ }).click()
      return win.locator('[data-slot="popover-content"]').locator(`[title="${name}"]`)
    }

    await go('/calendar')
    await win.getByRole('radio', { name: 'Місяць' }).click()
    await win.getByRole('button', { name: 'Подія', exact: true }).click()
    const dialog = win.getByRole('dialog', { name: 'Нова подія' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Назва')).toBeFocused()
    await dialog.getByLabel('Назва').fill(title)
    await dialog.getByRole('combobox').filter({ hasText: 'Не повторювати' }).click()
    await win.getByRole('option', { name: 'Щотижня' }).click()
    await dialog.getByRole('button', { name: 'Додати' }).click()
    await expect(dialog).toBeHidden()

    const event = (await rpc('events.list', { limit: 1000 })).find(
      (e: { title: string }) => e.title === title
    )
    expect(event.recurrence).toBe('weekly')
    const start = new Date(event.startAt)
    expect(start.toDateString()).toBe(now.toDateString())

    // Today: the lime circle and our event.
    const today = dayCell(win, now)
    await expect(today.locator('[aria-current="date"]')).toHaveText(String(now.getDate()))
    await expect(await reveal(today)).toBeVisible()
    await win.keyboard.press('Escape')
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    if (await dayCell(win, tomorrow).count())
      await expect(chip(dayCell(win, tomorrow))).toHaveCount(0)
    const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
    if (!(await dayCell(win, nextWeek).count()))
      await win.getByRole('button', { name: 'Вперед (→)' }).click()
    await expect(await reveal(dayCell(win, nextWeek))).toBeVisible()
    await win.keyboard.press('Escape')
    const feed = await rpc('events.feed', {
      from: start.getTime() - DAY,
      to: start.getTime() + 15 * DAY
    })
    expect(feed.filter((i: { ref: { id: string } }) => i.ref.id === event.id)).toHaveLength(3)

    // «Сьогодні» comes back to the current month.
    await win.getByRole('button', { name: 'Вперед (→)' }).click()
    await win.getByRole('button', { name: 'Сьогодні' }).click()
    await expect(dayCell(win, now).locator('[aria-current="date"]')).toBeVisible()

    // Open it from the grid, rename, then delete.
    await (await reveal(dayCell(win, now))).click()
    const edit = win.getByRole('dialog', { name: 'Подія' })
    await expect(edit.getByLabel('Назва')).toHaveValue(title)
    await edit.getByLabel('Назва').fill(`${title} змінена`)
    await edit.getByRole('button', { name: 'Зберегти' }).click()
    await expect(edit).toBeHidden()
    const renamed = await reveal(dayCell(win, now), `${title} змінена`)
    await expect(renamed).toBeVisible()
    await renamed.click()
    await win
      .getByRole('dialog', { name: 'Подія' })
      .getByRole('button', { name: 'У кошик' })
      .click()
    await expect(win.getByRole('dialog', { name: 'Подія' })).toBeHidden()
    await expect(chip(dayCell(win, now), `${title} змінена`)).toHaveCount(0)
    expect(await rpc('events.get', event.id)).toBeNull()
  })

  test('подія з ?open= відкривається з пошуку Ctrl+K', async ({ vault }) => {
    const { win, rpc, go } = vault
    const token = `ev${uid()}`
    const at = new Date()
    at.setDate(at.getDate() + 2)
    at.setHours(10, 0, 0, 0)
    const event = await rpc('events.create', { title: `Дзвінок ${token}`, startAt: at.getTime() })
    await go('/')
    await win.keyboard.press('Control+k')
    const palette = win.getByRole('dialog', { name: 'Пошук усюди' })
    await palette.getByRole('combobox').fill(token)
    await palette.getByRole('option', { name: new RegExp(`Дзвінок ${token}`) }).click()
    await expect.poll(() => hashPath(win)).toBe('/calendar')
    await expect.poll(() => openParam(win)).toBe(event.id)
    await expect(win.getByRole('dialog', { name: 'Подія' }).getByLabel('Назва')).toHaveValue(
      `Дзвінок ${token}`
    )
    await win.keyboard.press('Escape')
    await expect(win.getByRole('dialog', { name: 'Подія' })).toBeHidden()
  })
})

test.describe('конвертації', () => {
  test('ідея → «Перетворити на дошку» → дошка з карткою; в ідеї «Відкрити дошку»', async ({
    vault
  }) => {
    const { win, rpc, go } = vault
    const idea = await rpc('ideas.create', { title: `Конверт ${uid()}`, body: 'Що зробити першим' })
    await go(`/ideas?open=${idea.id}`)
    await win.getByRole('button', { name: 'Перетворити на дошку' }).click()
    await expect(win.getByText('Дошку створено')).toBeVisible()
    await expect.poll(() => hashPath(win)).toMatch(/^\/boards\/.+/)
    const boardId = (await hashPath(win)).split('/').pop()!
    await expect(win.getByText(`Розібрати ідею: ${idea.title}`)).toBeVisible()
    expect((await rpc('ideas.get', idea.id)).boardId).toBe(boardId)

    await go(`/ideas?open=${idea.id}`)
    await expect(win.getByRole('button', { name: 'Перетворити на дошку' })).toHaveCount(0)
    await win.getByRole('button', { name: 'Відкрити дошку' }).click()
    await expect.poll(() => hashPath(win)).toBe(`/boards/${boardId}`)
  })

  test('відгук → «Контракт» → проєкт і клієнт; відгук у статусі «Контракт»', async ({ vault }) => {
    const { win, rpc, go } = vault
    const token = `hr${uid()}`
    const platforms = await rpc('platforms.list')
    const proposal = await rpc('proposals.create', {
      platformId: platforms[0].id,
      jobTitle: `Лендинг ${token}`,
      bidAmount: 700,
      clientName: `Замовник ${token}`
    })
    await go(`/freelance/proposal/${proposal.id}`)
    await win.getByRole('button', { name: 'Контракт', exact: true }).click()
    const hire = win.getByRole('dialog', { name: 'Оформити контракт' })
    await expect(hire.getByRole('textbox').first()).toHaveValue(proposal.jobTitle)
    await hire.getByRole('button', { name: 'Створити контракт' }).click()
    await expect(win.getByText('Контракт створено')).toBeVisible()
    await expect.poll(() => hashPath(win)).toMatch(/^\/projects\/.+/)
    const projectId = (await hashPath(win)).split('/').pop()!
    await expect(win.getByRole('heading', { name: proposal.jobTitle })).toBeVisible()

    const project = await rpc('projects.get', projectId)
    expect(project).toMatchObject({ title: proposal.jobTitle, billing: 'fixed', fixedPrice: 700 })
    expect((await rpc('clients.get', project.clientId)).name).toBe(`Замовник ${token}`)
    expect((await rpc('proposals.get', proposal.id)).status).toBe('hired')
  })

  test('відгук → «Зробити шаблоном» → шаблон з текстом листа відкрито', async ({ vault }) => {
    const { win, rpc, go } = vault
    const cover = `Hi! I have built 12 similar stores ${uid()}.`
    const platforms = await rpc('platforms.list')
    const proposal = await rpc('proposals.create', {
      platformId: platforms[0].id,
      jobTitle: `Шопіфай ${uid()}`,
      coverLetter: cover
    })
    await go(`/freelance/proposal/${proposal.id}`)
    // It is an edit action: hidden while reading.
    await expect(win.getByRole('button', { name: 'Зробити шаблоном' })).toBeHidden()
    await win.locator('[data-edit-detail]').click()
    await win.getByRole('button', { name: 'Зробити шаблоном' }).click()
    await expect(win.getByText('Шаблон створено')).toBeVisible()
    await expect.poll(() => hashPath(win)).toBe('/freelance/templates')
    const templateId = await openParam(win)
    expect(templateId).toBeTruthy()
    expect((await rpc('templates.get', templateId)).body).toBe(cover)
  })
})
