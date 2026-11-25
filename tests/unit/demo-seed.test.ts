/** «Заповнити демо-даними»: only in the sandbox, once, Ukrainian texts, every section gets something. */
import { describe, expect, it, vi } from 'vitest'
import type { Api } from '@shared/api'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const { DemoSeedService, DEMO_SEED_KEY } = await import('@main/services/demo-seed')
const { UserError } = await import('@main/core/util')

/** A recording API: creating calls return an id; the few reads the seed makes return what it looks for. */
function fakeApi(opts: { failOn?: string } = {}): {
  api: Api
  calls: { path: string; arg: unknown }[]
} {
  const calls: { path: string; arg: unknown }[] = []
  let n = 0
  const reads: Record<string, unknown> = {
    'boards.details': { columns: [{ id: 'col-1' }, { id: 'col-2' }] },
    'checklists.list': [{ id: 'tpl-1' }],
    'platforms.list': [{ id: 'up-1', kind: 'upwork' }],
    'jobs.boards': [{ id: 'jb-1', name: 'Djinni' }]
  }
  const api = new Proxy(
    {},
    {
      get: (_t, ns: string) =>
        new Proxy(
          {},
          {
            get: (_t2, method: string) => async (arg: unknown) => {
              const path = `${ns}.${method}`
              if (path === opts.failOn) throw new Error('boom')
              calls.push({ path, arg })
              return path in reads ? reads[path] : { id: `${ns}-${++n}` }
            }
          }
        )
    }
  ) as Api
  return { api, calls }
}

function make(opts: { failOn?: string } = {}): {
  svc: InstanceType<typeof DemoSeedService>
  calls: { path: string; arg: unknown }[]
  seeded: Set<string>
  changed: unknown[]
} {
  const seeded = new Set<string>()
  const ledger = { isSeeded: (k: string) => seeded.has(k), markSeeded: (k: string) => void seeded.add(k) }
  const changed: unknown[] = []
  const bus = { dataChanged: (t: unknown) => void changed.push(t) }
  const { api, calls } = fakeApi(opts)
  const svc = new DemoSeedService(() => api, ledger, bus as never, 'icon.png')
  return { svc, calls, seeded, changed }
}

describe('DemoSeedService', () => {
  it('в основному профілі — відмова', async () => {
    const { svc, calls } = make()
    await expect(svc.fill('main')).rejects.toThrow('Демо-дані додаються лише в тестовому режимі')
    expect(calls).toEqual([])
  })

  it('у тестовому: записи в різних розділах, позначка й оновлення вікон', async () => {
    const { svc, calls, seeded, changed } = make()
    const { created } = await svc.fill('sandbox')
    expect(created).toBeGreaterThan(20)
    const namespaces = new Set(calls.map((c) => c.path.split('.')[0]))
    for (const ns of ['ideas', 'cards', 'snippets', 'libraries', 'clients', 'projects', 'proposals', 'jobs', 'english', 'events', 'designs'])
      expect(namespaces).toContain(ns)
    expect(seeded.has(DEMO_SEED_KEY)).toBe(true)
    expect(changed).toEqual(['all'])
    // The picture comes from the app icon, not a path from the renderer.
    expect(calls.find((c) => c.path === 'designs.importImage')?.arg).toMatchObject({
      source: { kind: 'path', path: 'icon.png' }
    })
  })

  it('удруге — відмова з підказкою «Очистити»', async () => {
    const { svc } = make()
    await svc.fill('sandbox')
    await expect(svc.fill('sandbox')).rejects.toThrow(/Демо-дані вже додано/)
  })

  it('збій посередині: позначка все одно, зрозуміла помилка', async () => {
    const { svc, seeded, changed } = make({ failOn: 'clients.create' })
    const err = await svc.fill('sandbox').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UserError)
    expect((err as Error).message).toBe('Демо-дані додано не повністю — подробиці в журналі')
    expect(seeded.has(DEMO_SEED_KEY)).toBe(true)
    expect(changed).toEqual(['all'])
  })

  it('тексти українською: без ы, э, ъ, ё', async () => {
    const { svc, calls } = make()
    await svc.fill('sandbox')
    const texts = calls.flatMap((c) => {
      const a = (c.arg ?? {}) as Record<string, unknown>
      const input = (a.input ?? a) as Record<string, unknown>
      return ['title', 'name', 'body', 'content', 'translation', 'question', 'answer', 'purpose', 'solution', 'description']
        .map((k) => input[k])
        .filter((v): v is string => typeof v === 'string')
    })
    expect(texts.length).toBeGreaterThan(10)
    for (const t of texts) expect(t).not.toMatch(/[ыэъёЫЭЪЁ]/)
  })
})
