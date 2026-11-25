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
  for (const len of [150, 200]) {
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
      expect(details.cards[0].title.length).toBeLessThanOrEqual(200)
      const after = await rpc('ideas.get', idea.id)
      expect(after.boardId).toBe(board.id)
      expect(after.status).toBe('in_progress')
      // A second conversion is refused.
      const again = await vault.rpcRaw('ideas.convertToBoard', idea.id)
      expect(again.ok).toBe(false)
    })
  }
})

test.describe('quick add', () => {
  test('a link on the first line + a long multi-line text makes a bookmark, not an error', async ({ vault }) => {
    // ~3 000 characters: past the 200-char title limit, within quick add's own 5 000 and a bookmark's notes.
    const long = Array.from({ length: 30 }, (_, i) => `Рядок ${i} ${'текст '.repeat(15)}`).join('\n')
    const saved = await vault.rpc('app.quickAdd', { target: 'bookmark', text: `https://example.com/${uid()}\n${long}` })
    const b = await vault.rpc('bookmarks.get', saved.id)
    expect(b.url).toMatch(/^https:\/\/example\.com\//)
    expect(b.title.length).toBeLessThanOrEqual(200)
    expect(b.title).toContain('Рядок 0')
    expect(b.notes).toContain('Рядок 29')
  })

  test('an event lands tomorrow at 10:00 local time', async ({ vault }) => {
    const saved = await vault.rpc('app.quickAdd', { target: 'event', text: `Зустріч ${uid()}` })
    const e = await vault.rpc('events.get', saved.id)
    const d = new Date(e.startAt)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      10,
      0
    ])
  })

  test('a word longer than the term limit is clipped instead of failing', async ({ vault }) => {
    const saved = await vault.rpcRaw('app.quickAdd', { target: 'word', text: `${'a'.repeat(400)} — переклад` })
    expect(saved.ok).toBe(true)
  })
})

test.describe('validation audit: internal writes and uniqueness', () => {
  test('an idea body at its limit converts: the board and the card get the whole text', async ({ vault }) => {
    const { rpc } = vault
    const body = `Опис ${uid()} `.repeat(3000).slice(0, 20_000)
    const idea = await rpc('ideas.create', { title: `Велика ідея ${uid()}`, body })
    const board = await rpc('ideas.convertToBoard', idea.id)
    const details = await rpc('boards.details', board.id)
    expect(details.board.description).toHaveLength(20_000)
    expect(details.cards[0].description).toBe(body)
  })

  test('a platform name is unique case-insensitively (create and rename)', async ({ vault }) => {
    const name = `Біржа ${uid()}`
    const a = await vault.rpc('platforms.create', { name })
    const dup = await vault.rpcRaw('platforms.create', { name: name.toUpperCase() })
    expect(dup.ok).toBe(false)
    expect(dup.error).toContain('вже є')
    const b = await vault.rpc('platforms.create', { name: `${name} 2` })
    const rename = await vault.rpcRaw('platforms.update', { id: b.id, patch: { name: ` ${name.toLowerCase()} ` } })
    expect(rename.ok).toBe(false)
    // Renaming to its own name in another case is fine.
    const self = await vault.rpcRaw('platforms.update', { id: a.id, patch: { name: name.toUpperCase() } })
    expect(self.ok).toBe(true)
  })

  test('a company cannot be renamed into another company', async ({ vault }) => {
    const name = `Компанія ${uid()}`
    await vault.rpc('jobs.createCompany', { name })
    const other = await vault.rpc('jobs.createCompany', { name: `${name} інша` })
    const r = await vault.rpcRaw('jobs.updateCompany', { id: other.id, patch: { name: name.toLowerCase() } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('вже є')
  })

  test('client email: empty or email-like only', async ({ vault }) => {
    const bad = await vault.rpcRaw('clients.create', { name: `Клієнт ${uid()}`, email: 'anna at bloom' })
    expect(bad.ok).toBe(false)
    const ok = await vault.rpc('clients.create', { name: `Клієнт ${uid()}`, email: ' anna@bloom.store ' })
    expect(ok.email).toBe('anna@bloom.store')
    const none = await vault.rpcRaw('clients.create', { name: `Клієнт ${uid()}` })
    expect(none.ok).toBe(true)
  })
})
