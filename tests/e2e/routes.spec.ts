import { DAY, expect, test, uid } from './fixtures'

/** Every main screen renders on seeded data without uncaught errors or console.error. */

const ROUTES = [
  '/',
  '/ideas',
  '/boards',
  '/boards/{board}',
  '/calendar',
  '/checklists',
  '/checklists/{checklist}',
  '/freelance',
  '/freelance/p/{platform}',
  '/freelance/templates',
  '/freelance/portfolio',
  '/freelance/flags',
  '/freelance/goals',
  '/freelance/calculator',
  '/finance',
  '/finance/income',
  '/finance/expenses',
  '/finance/withdrawals',
  '/clients',
  '/clients/{client}',
  '/projects/{project}',
  '/notes',
  '/claude',
  '/snippets',
  '/components',
  '/libraries',
  '/fixes',
  '/designs',
  '/bookmarks',
  '/english',
  '/jobs',
  '/jobs/applications',
  '/jobs/interviews',
  '/jobs/companies',
  '/jobs/resumes',
  '/jobs/questions',
  '/jobs/stats',
  '/knowledge',
  '/review',
  '/guide',
  '/tags',
  '/trash',
  '/settings'
]

test('main routes render without page errors or console errors', async ({ vault }) => {
  test.setTimeout(180_000)
  const { rpc, go, win, errors } = vault
  const ids: Record<string, string> = {
    board: (await rpc('boards.list'))[0].id,
    checklist: (await rpc('checklists.list', { kind: 'run' }))[0].id,
    platform: (await rpc('platforms.list'))[0].id,
    client: (await rpc('clients.list'))[0].id,
    project: (await rpc('projects.list'))[0].id
  }
  const failures: string[] = []
  for (const raw of ROUTES) {
    const route = raw.replace(/\{(\w+)\}/g, (_, k: string) => ids[k])
    errors.length = 0
    await go(route)
    await win.waitForTimeout(900)
    // The route error boundary («Екран не відкрився») must not be shown. By attribute: the guide quotes the text.
    const crashed = await win.locator('[data-route-error]').count()
    if (crashed) failures.push(`${raw}: route error screen`)
    if (errors.length) failures.push(`${raw}:\n  ${errors.join('\n  ')}`)
  }
  errors.length = 0
  expect(failures, failures.join('\n')).toEqual([])
})

test.describe('calendar month view', () => {
  test('renders recurring events in the month grid and switches months / views', async ({
    vault
  }) => {
    const { rpc, go, win } = vault
    const now = new Date()
    const t = `Щоденна ${uid()}`
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0).getTime()
    await rpc('events.create', { title: t, startAt: start, recurrence: 'daily' })
    await rpc('events.create', {
      title: `31-го ${uid()}`,
      startAt: new Date(2026, 0, 31, 12).getTime(),
      recurrence: 'monthly'
    })
    await rpc('events.create', {
      title: `Довга ${uid()}`,
      startAt: start - 3 * DAY,
      endAt: start + 2 * DAY
    })

    await go('/calendar')
    await win.getByText('Місяць', { exact: true }).click()
    const dayCells = win.getByRole('button', { name: /^Нова подія / })
    await expect(dayCells.first()).toBeVisible()
    const cells = await dayCells.count()
    expect([35, 42]).toContain(cells)
    // The daily event is placed on many days of the month.
    await expect.poll(() => win.locator(`[title$="${t}"]`).count()).toBeGreaterThanOrEqual(20)

    await win.keyboard.press('ArrowRight')
    await expect(dayCells.first()).toBeVisible()
    await win.keyboard.press('ArrowLeft')
    await win.keyboard.press('t')
    await win.getByText('Тиждень', { exact: true }).click()
    // Week view: one agenda row per day of the week (the event started on the 1st).
    await expect.poll(() => win.getByText(t, { exact: true }).count()).toBeGreaterThanOrEqual(1)
    await win.getByText('Місяць', { exact: true }).click()
  })
})
