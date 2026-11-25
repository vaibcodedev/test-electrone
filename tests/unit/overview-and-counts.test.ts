/**
 * Server-side numbers the pages show instead of counting a full list in the renderer:
 * recent records of chosen types, note folders, design kinds, CRM overview, finance window, template order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { KnowledgeModule } from '@main/modules/knowledge'
import { FinanceModule, monthKey } from '@main/modules/finance'
import { FreelanceModule } from '@main/modules/freelance'
import { DashboardService } from '@main/services/dashboard-service'
import { messageTemplates, notes } from '@main/db/schema'
import { hostOf } from '@shared/url'
import { calendarItemRoute } from '@shared/domain/calendar'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
let knowledge: KnowledgeModule
beforeEach(() => {
  v = openVault()
  knowledge = new KnowledgeModule(v.m)
  for (const d of knowledge.descriptors) v.registry.register(d)
})
afterEach(() => v.close())

const DAY = 24 * 60 * 60 * 1000

describe('search.recent with types', () => {
  it('finds the knowledge records behind many newer edits elsewhere', async () => {
    const note = await knowledge.notesApi().create({ title: 'Нотатка' })
    v.db.orm.update(notes).set({ updatedAt: 1000 }).where(eq(notes.id, note.id)).run()
    for (let i = 0; i < 12; i++) await v.api.projects.create({ title: `Проєкт ${i}` })
    const dashboard = new DashboardService(v.db, v.registry, {} as never, {} as never)
    const api = v.search.api((limit, types) => dashboard.recent(limit, types))
    expect((await api.recent(5)).some((r) => r.id === note.id)).toBe(false)
    const only = await api.recent({ limit: 5, types: ['note', 'snippet'] })
    expect(only.map((r) => [r.type, r.id])).toEqual([['note', note.id]])
  })

  it('keeps the bare number form and rejects a limit over 50', async () => {
    const dashboard = new DashboardService(v.db, v.registry, {} as never, {} as never)
    const api = v.search.api((limit, types) => dashboard.recent(limit, types))
    await expect(api.recent(3)).resolves.toEqual([])
    await expect(api.recent({ limit: 51 })).rejects.toThrow()
  })
})

describe('notes.folderCounts', () => {
  it('counts folders under the same search and tag as the list', async () => {
    const api = knowledge.notesApi()
    await api.create({ title: 'Vite конфіг', folder: 'Робота' })
    await api.create({ title: 'Vite плагіни', folder: 'Ідеї' })
    await api.create({ title: 'Рецепт', folder: 'Робота' })
    expect(await api.folderCounts()).toEqual([
      { folder: 'Ідеї', count: 1 },
      { folder: 'Робота', count: 2 }
    ])
    expect(await api.folderCounts({ search: 'vite' })).toEqual([
      { folder: 'Ідеї', count: 1 },
      { folder: 'Робота', count: 1 }
    ])
  })
})

describe('designs.counts', () => {
  it('counts kinds under the search, without the kind filter itself', async () => {
    const api = v.media.designsApi()
    await api.create({ title: 'Лендинг кави', kind: 'landing' })
    await api.create({ title: 'Магазин кави', kind: 'shop' })
    await api.create({ title: 'Сайт студії', kind: 'site' })
    expect(await api.counts()).toEqual({ landing: 1, shop: 1, site: 1 })
    expect(await api.counts({ search: 'кави' })).toEqual({ landing: 1, shop: 1 })
  })
})

describe('crm overview', () => {
  it('outstanding matches the project rows: fixed 1200, paid 600, no open stages → 600', async () => {
    const p = await v.api.projects.create({ title: 'Сайт', billing: 'fixed', fixedPrice: 1200 })
    const payments = v.crm.paymentsApi()
    await payments.create({ projectId: p.id, amount: 600, status: 'paid', paidAt: Date.now() })
    const o = await v.api.projects.overview()
    expect(o.outstanding.USD).toBe(600)
    expect((await v.api.projects.get(p.id))?.outstandingAmount).toBe(600)
  })

  it('counts projects per status and clients/projects per platform', async () => {
    const upwork = await v.api.platforms.create({ name: 'Upwork' })
    const c = await v.api.clients.create({ name: 'Анна', platformId: upwork.id })
    await v.api.clients.create({ name: 'Напряму' })
    await v.api.projects.create({ title: 'A', clientId: c.id, platformId: upwork.id })
    await v.api.projects.create({ title: 'B', status: 'lead' })
    const o = await v.api.projects.overview()
    expect(o.projectsByStatus).toEqual({ lead: 1, active: 1, paused: 0, done: 0, cancelled: 0 })
    expect(o.totalProjects).toBe(2)
    expect(o.byPlatform[upwork.id]).toEqual({ clients: 1, projects: 1 })
    expect(o.byPlatform.direct).toEqual({ clients: 1, projects: 1 })
  })

  it('project and client summaries carry overdue payments', async () => {
    const c = await v.api.clients.create({ name: 'Марк' })
    const p = await v.api.projects.create({ title: 'API', clientId: c.id, fixedPrice: 900 })
    const payments = v.crm.paymentsApi()
    await payments.create({ projectId: p.id, amount: 300, dueAt: Date.now() - 3 * DAY })
    await payments.create({ projectId: p.id, amount: 200, dueAt: Date.now() + 3 * DAY })
    const project = await v.api.projects.get(p.id)
    expect(project).toMatchObject({ overduePayments: 1, overdueAmount: 300 })
    const client = await v.api.clients.get(c.id)
    expect(client).toMatchObject({ overduePayments: 1, overdueTotal: 300 })
  })
})

describe('finance.overview window', () => {
  it('ends with the current month, or with an older picked month', async () => {
    const finance = new FinanceModule(v.m, new FreelanceModule(v.m, v.crm)).api()
    const current = monthKey(Date.now())
    const now = await finance.overview()
    expect(now.months).toHaveLength(12)
    expect(now.months[11].month).toBe(current)
    // A month inside the last 12 doesn't move the window.
    const recent = monthKey(
      new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).getTime()
    )
    expect((await finance.overview({ month: recent })).months[11].month).toBe(current)
    const old = await finance.overview({ month: '2020-03' })
    expect(old.months.map((m) => m.month)).toEqual([
      '2019-04',
      '2019-05',
      '2019-06',
      '2019-07',
      '2019-08',
      '2019-09',
      '2019-10',
      '2019-11',
      '2019-12',
      '2020-01',
      '2020-02',
      '2020-03'
    ])
    await expect(finance.overview({ month: '2020-3' })).rejects.toThrow()
  })
})

describe('templates order', () => {
  it('groups follow the chips (Відгук first), the newest template tops its group', async () => {
    const api = v.api.templates
    const closing = await api.create({ title: 'Здача роботи', situation: 'closing' })
    const older = await api.create({ title: 'Старий відгук', situation: 'proposal' })
    const newer = await api.create({ title: 'Новий відгук', situation: 'proposal' })
    const follow = await api.create({ title: 'Нагадування', situation: 'follow_up' })
    const stamp = (id: string, at: number): void => {
      v.db.orm
        .update(messageTemplates)
        .set({ updatedAt: at })
        .where(eq(messageTemplates.id, id))
        .run()
    }
    stamp(older.id, 1000)
    stamp(newer.id, 2000)
    await api.markCopied(older.id)
    const list = await api.list()
    expect(list.map((t) => t.id)).toEqual([newer.id, older.id, follow.id, closing.id])
  })
})

describe('shared helpers', () => {
  it('hostOf reads an address saved without a scheme', () => {
    expect(hostOf('https://www.github.com/x')).toBe('github.com')
    expect(hostOf('www.dribbble.com/shots/1')).toBe('dribbble.com')
    expect(hostOf('jobs.dou.ua')).toBe('jobs.dou.ua')
    expect(hostOf('')).toBeUndefined()
    expect(hostOf('not a url')).toBeUndefined()
  })

  it('calendarItemRoute: the item route wins over the record route', () => {
    const ref = { type: 'event' as const, id: 'e1' }
    expect(calendarItemRoute({ ref, route: '/finance/expenses?month=2026-11' })).toBe(
      '/finance/expenses?month=2026-11'
    )
    expect(calendarItemRoute({ ref })).toMatch(/e1/)
  })
})
