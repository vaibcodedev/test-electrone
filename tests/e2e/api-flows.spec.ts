import { DAY, expect, test, uid } from './fixtures'

/** Business rules through the public RPC API of the running app (same path the UI uses). */

/** Today 23:58 local: still «today» on the dashboard and not yet overdue whenever the suite runs. */
const lateToday = (): number => {
  const d = new Date()
  d.setHours(23, 58, 0, 0)
  return d.getTime()
}
const dayKey = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('search is case-insensitive for Cyrillic', () => {
  test('templates.list search «зд» / «ЗД» finds «Здача…»', async ({ vault }) => {
    for (const search of ['зд', 'ЗД', 'здача']) {
      const found = await vault.rpc('templates.list', { search })
      expect(
        found.map((t: { title: string }) => t.title).some((t: string) => t.startsWith('Здача')),
        search
      ).toBe(true)
    }
  })

  test('ideas.list, global search and the page search field find «Здача…» by «зд»', async ({
    vault
  }) => {
    const { rpc, go, win } = vault
    const title = `Здача проєкту ${uid()}`
    const idea = await rpc('ideas.create', { title })
    const listed = await rpc('ideas.list', { search: 'зд' })
    expect(listed.map((i: { id: string }) => i.id)).toContain(idea.id)
    const hits = await rpc('search.query', { text: 'здача' })
    expect(hits.map((h: { id: string }) => h.id)).toContain(idea.id)

    await go('/ideas')
    await win.locator('[data-page-search]').fill('зД')
    await expect(win.getByText(title)).toBeVisible()
  })

  test('LIKE wildcards in the query are literal', async ({ vault }) => {
    const { rpc } = vault
    const token = uid()
    const plain = await rpc('ideas.create', { title: `Знижка ${token}` })
    const pct = await rpc('ideas.create', { title: `Знижка 50% ${token}` })
    const ids = (await rpc('ideas.list', { search: '50%' })).map((i: { id: string }) => i.id)
    expect(ids).toContain(pct.id)
    expect(ids).not.toContain(plain.id)
  })
})

test.describe('deleting a board hides its cards everywhere', () => {
  test('dashboard, weekly review, calendar, due list, pins, search', async ({ vault }) => {
    const { rpc } = vault
    const token = `zq${uid()}`
    const board = await rpc('boards.create', { title: `Дошка ${token}` })
    const { columns } = await rpc('boards.details', board.id)
    const first = columns[0]
    const done = columns.find((c: { isDone: boolean }) => c.isDone)
    const dueToday = await rpc('cards.create', {
      boardId: board.id,
      columnId: first.id,
      title: `Сьогодні ${token}`,
      dueAt: lateToday()
    })
    const overdue = await rpc('cards.create', {
      boardId: board.id,
      columnId: first.id,
      title: `Прострочена ${token}`,
      dueAt: lateToday() - 2 * DAY
    })
    const finished = await rpc('cards.create', {
      boardId: board.id,
      columnId: done.id,
      title: `Готова ${token}`
    })
    await rpc('pins.toggle', { ref: { type: 'card', id: dueToday.id }, kind: 'pin' })
    const ours = new Set([board.id, dueToday.id, overdue.id, finished.id])
    const mine = (list: { id: string }[]): string[] =>
      list.map((x) => x.id).filter((id) => ours.has(id))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = async (): Promise<Record<string, any>> => {
      const dash = await rpc('app.dashboard')
      const review = await rpc('review.get')
      const feed = await rpc('events.feed', {
        from: lateToday() - 7 * DAY,
        to: lateToday() + 7 * DAY
      })
      const due = await rpc('cards.due', { from: 0, to: 9e15 })
      const hits = await rpc('search.query', { text: token })
      const pending = review.snapshot.pending.flatMap((g: { items: { id: string }[] }) => g.items)
      return {
        today: mine(dash.today.cards),
        overdue: mine(dash.today.overdue),
        recent: mine(dash.recent),
        pinned: mine(dash.pinned),
        activityToday:
          dash.activity.find((a: { day: string }) => a.day === dayKey(Date.now()))?.count ?? 0,
        cardCount: dash.counts.card as number,
        reviewDone: mine(review.snapshot.done),
        reviewPending: mine(pending),
        cardsDoneMetric: review.snapshot.sections[0].metrics.find(
          (m: { key: string }) => m.key === 'cardsDone'
        ).value as number,
        feed: feed
          .filter((i: { ref: { id: string } }) => ours.has(i.ref.id))
          .map((i: { ref: { id: string } }) => i.ref.id),
        due: mine(due),
        search: mine(hits)
      }
    }

    const before = await snapshot()
    expect(before.today).toEqual([dueToday.id])
    expect(before.overdue).toEqual([overdue.id])
    expect(before.recent.length).toBeGreaterThan(0)
    expect(before.pinned).toEqual([dueToday.id])
    expect(before.reviewDone).toEqual([finished.id])
    expect(before.reviewPending).toEqual([overdue.id])
    expect(before.feed.sort()).toEqual([dueToday.id, overdue.id].sort())
    expect(before.due.sort()).toEqual([dueToday.id, overdue.id].sort())
    expect(before.search.length).toBeGreaterThan(0)

    await rpc('boards.remove', board.id)
    const after = await snapshot()
    expect(after.today, 'dashboard today').toEqual([])
    expect(after.overdue, 'dashboard overdue').toEqual([])
    expect(after.recent, 'dashboard recent').toEqual([])
    expect(after.pinned, 'dashboard pinned').toEqual([])
    expect(after.activityToday, 'activity chart').toBe(before.activityToday - 1)
    expect(after.cardCount, 'card counter').toBe(before.cardCount - 3)
    expect(after.reviewDone, 'weekly review done').toEqual([])
    expect(after.reviewPending, 'weekly review overdue').toEqual([])
    expect(after.cardsDoneMetric, 'weekly cardsDone').toBe(before.cardsDoneMetric - 1)
    expect(after.feed, 'calendar feed').toEqual([])
    expect(after.due, 'cards.due').toEqual([])
    expect(after.search, 'global search').toEqual([])

    // Restoring the board brings everything back.
    await rpc('trash.restore', { type: 'board', id: board.id })
    const restored = await snapshot()
    expect(restored.today).toEqual([dueToday.id])
    expect(restored.reviewDone).toEqual([finished.id])
  })
})

test.describe('finance: withdrawals', () => {
  const at = Date.now()

  test('received is computed as (amount − fee) × rate and follows amount / rate edits', async ({
    vault
  }) => {
    const { rpc } = vault
    const w = await rpc('finance.createWithdrawal', { amount: 100, fee: 2, rate: 40, at })
    expect(w.received).toBe(3920)
    // UI sends received: null when the field is empty (= auto)
    const a = await rpc('finance.updateWithdrawal', {
      id: w.id,
      patch: { amount: 200, received: null }
    })
    expect(a.received).toBe(7920)
    // API caller that only sends the changed input
    const b = await rpc('finance.updateWithdrawal', { id: w.id, patch: { rate: 41 } })
    expect(b.received).toBe(8118)
    const c = await rpc('finance.updateWithdrawal', { id: w.id, patch: { fee: 10 } })
    expect(c.received).toBe(7790)
  })

  test('a manual received amount survives unrelated edits', async ({ vault }) => {
    const { rpc } = vault
    const w = await rpc('finance.createWithdrawal', {
      amount: 100,
      fee: 0,
      rate: 40,
      at,
      received: 3800
    })
    expect(w.received).toBe(3800)
    const n = await rpc('finance.updateWithdrawal', {
      id: w.id,
      patch: { note: 'Monobank', method: 'Payoneer' }
    })
    expect(n.received).toBe(3800)
    // Clearing the field (null) switches back to auto
    const auto = await rpc('finance.updateWithdrawal', { id: w.id, patch: { received: null } })
    expect(auto.received).toBe(4000)
  })

  test('fee larger than the amount gives 0, never a negative sum', async ({ vault }) => {
    const { rpc } = vault
    const w = await rpc('finance.createWithdrawal', { amount: 10, fee: 20, rate: 40, at })
    expect(w.received).toBe(0)
    const ok = await rpc('finance.createWithdrawal', { amount: 100, fee: 1, rate: 1, at })
    const u = await rpc('finance.updateWithdrawal', { id: ok.id, patch: { fee: 500 } })
    expect(u.received).toBe(0)
    const list = await rpc('finance.withdrawals', { from: at - DAY, to: at + DAY })
    expect(list.every((x: { received: number }) => x.received >= 0)).toBe(true)
  })

  test('rounds received to cents', async ({ vault }) => {
    const w = await vault.rpc('finance.createWithdrawal', {
      amount: 33.33,
      fee: 0,
      rate: 41.37,
      at
    })
    expect(w.received).toBe(1378.86)
  })
})

test.describe('fixed-price project: stages within the price', () => {
  test('a cancelled stage frees its share of the budget', async ({ vault }) => {
    const { rpc, rpcRaw } = vault
    const project = await rpc('projects.create', {
      title: `Фікс ${uid()}`,
      billing: 'fixed',
      fixedPrice: 1000,
      currency: 'USD'
    })
    const s1 = await rpc('payments.create', { projectId: project.id, amount: 600, currency: 'USD' })
    const over = await rpcRaw('payments.create', {
      projectId: project.id,
      amount: 500,
      currency: 'USD'
    })
    expect(over.ok).toBe(false)
    expect(over.error).toContain('щонайбільше')

    await rpc('payments.update', { id: s1.id, patch: { status: 'cancelled' } })
    const full = await rpcRaw('payments.create', {
      projectId: project.id,
      amount: 1000,
      currency: 'USD'
    })
    expect(full.ok, full.error).toBe(true)
  })

  test('stages in another currency are rejected', async ({ vault }) => {
    const { rpc, rpcRaw } = vault
    const project = await rpc('projects.create', {
      title: `Фікс ${uid()}`,
      billing: 'fixed',
      fixedPrice: 1000,
      currency: 'EUR'
    })
    const r = await rpcRaw('payments.create', {
      projectId: project.id,
      amount: 10,
      currency: 'USD'
    })
    expect(r.ok).toBe(false)
  })

  // Regression (was a bug): crm.ts payments.update checks the price only when amount/currency change. Restoring a cancelled stage
  // (status: cancelled → expected) skips assertWithinPrice, so stages can exceed the project price.
  test('restoring a cancelled stage may not exceed the price', async ({ vault }) => {
    const { rpc, rpcRaw } = vault
    const project = await rpc('projects.create', {
      title: `Фікс ${uid()}`,
      billing: 'fixed',
      fixedPrice: 1000,
      currency: 'USD'
    })
    const s1 = await rpc('payments.create', { projectId: project.id, amount: 600, currency: 'USD' })
    await rpc('payments.update', { id: s1.id, patch: { status: 'cancelled' } })
    await rpc('payments.create', { projectId: project.id, amount: 1000, currency: 'USD' })
    const back = await rpcRaw('payments.update', { id: s1.id, patch: { status: 'expected' } })
    expect(back.ok, 'stages would total 1600 of 1000').toBe(false)
  })
})

test.describe('idea → board with long titles', () => {
  for (const len of [400, 500]) {
    test(`convertToBoard with a ${len}-char title`, async ({ vault }) => {
      const { rpc } = vault
      const title = `Довга ідея ${uid()} `.repeat(60).slice(0, len - 1) + 'Ж'
      const idea = await rpc('ideas.create', { title })
      expect(idea.title).toHaveLength(len)
      const board = await rpc('ideas.convertToBoard', idea.id)
      expect(board.title).toBe(idea.title)
      const details = await rpc('boards.details', board.id)
      expect(details.cards).toHaveLength(1)
      expect(details.cards[0].title.startsWith('Розібрати ідею: ')).toBe(true)
      expect(details.cards[0].title.length).toBeLessThanOrEqual(500)
      const after = await rpc('ideas.get', idea.id)
      expect(after.boardId).toBe(board.id)
      expect(after.status).toBe('in_progress')
      // A second conversion is refused.
      const again = await vault.rpcRaw('ideas.convertToBoard', idea.id)
      expect(again.ok).toBe(false)
    })
  }
})
