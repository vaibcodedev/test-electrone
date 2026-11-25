/** Designs on a real database: the background palette fill-in must not look like an edit. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openVault, type Vault } from './support/vault'
import { PinService } from '@main/services/pin-service'
import { designTitleOf } from '@shared/design-title'
import { eq } from 'drizzle-orm'
import { designs } from '@main/db/schema'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('designs.setColors', () => {
  it('stores the palette without touching «Змінено»', async () => {
    const api = v.media.designsApi()
    const d = await api.create({ title: 'Лендінг' })
    await api.setColors({ id: d.id, colors: ['#112233', '#AABBCC'] })
    const after = await api.get(d.id)
    expect(after?.colors).toEqual(['#112233', '#AABBCC'])
    expect(after?.updatedAt).toBe(d.updatedAt)
  })

  it('refuses a broken colour and a missing design', async () => {
    const api = v.media.designsApi()
    const d = await api.create({ title: 'Лендінг' })
    await expect(api.setColors({ id: d.id, colors: ['red'] })).rejects.toThrow()
    await expect(api.setColors({ id: 'missing', colors: [] })).rejects.toThrow()
  })
})

describe('design file size', () => {
  // webp: FileStorage only asks nativeImage (mocked empty here) for PNG and JPEG sizes.
  const bytes = new Uint8Array(4321).fill(7)
  const source = { kind: 'bytes' as const, name: 'shot.webp', mime: 'image/webp', data: bytes }

  it('is stored on import and when the picture is replaced', async () => {
    const api = v.media.designsApi()
    const d = await api.importImage({ source })
    expect(d.imageBytes).toBe(4321)
    const replaced = await api.replaceImage({
      id: d.id,
      source: { ...source, data: new Uint8Array(99) }
    })
    expect(replaced.imageBytes).toBe(99)
  })

  it('is filled in once at start for designs imported before it was stored', async () => {
    const api = v.media.designsApi()
    const d = await api.importImage({ source })
    v.db.orm.update(designs).set({ imageBytes: null }).where(eq(designs.id, d.id)).run()
    expect((await api.get(d.id))?.imageBytes).toBeNull()
    expect(v.media.backfillImageBytes()).toBe(1)
    expect((await api.get(d.id))?.imageBytes).toBe(4321)
    // Nothing left to fill: later starts do nothing.
    expect(v.media.backfillImageBytes()).toBe(0)
  })
})

describe('moodboards.list order, search and count', () => {
  /** A board with one live design in it. */
  const filledBoard = async (title: string): Promise<string> => {
    const b = await v.media.moodboardsApi().create({ title })
    const d = await v.media.designsApi().create({ title: `Дизайн для ${title}` })
    await v.media.moodboardsApi().addDesigns({ moodboardId: b.id, designIds: [d.id] })
    return b.id
  }

  it('puts favourites first, then boards with designs, then empty ones', async () => {
    const api = v.media.moodboardsApi()
    const fav = await api.create({ title: 'Обрана порожня' })
    const filled = await filledBoard('Повна')
    // Created last, so it is the newest — and still goes after the filled one.
    const empty = await api.create({ title: 'Порожня' })
    new PinService(v.db, v.registry).toggle({ type: 'moodboard', id: fav.id }, 'favorite')

    const list = await api.list()
    expect(list.map((b) => b.id)).toEqual([fav.id, filled, empty.id])
    expect(list.map((b) => b.favorite)).toEqual([true, false, false])
    expect((await api.get(fav.id))?.favorite).toBe(true)
  })

  it('sorts a board whose designs are all in the trash with the empty ones', async () => {
    const api = v.media.moodboardsApi()
    const trashed = await filledBoard('Дизайни в кошику')
    const live = await filledBoard('Живі дизайни')
    const empty = await api.create({ title: 'Нова порожня' })
    const [design] = (await api.details(trashed))!.designs
    await v.media.designsApi().remove(design.id)
    // Touch the trashed one so it is the newest: the order must still come from «filled», not the date.
    await api.update({ id: trashed, patch: { description: 'оновлено' } })

    const list = await api.list()
    expect(list[0].id).toBe(live)
    expect(list.find((b) => b.id === trashed)?.itemCount).toBe(0)
    expect(list.slice(1).map((b) => b.id)).toEqual([trashed, empty.id])
  })

  it('searches the title and the description case-insensitively, skipping deleted boards', async () => {
    const api = v.media.moodboardsApi()
    const byTitle = await api.create({ title: 'Темні лендинги' })
    const byText = await api.create({ title: 'Інше', description: 'Усе в темній гамі' })
    await api.create({ title: 'Світлі' })
    const gone = await api.create({ title: 'Темна стара' })
    await api.remove(gone.id)

    const found = await api.list({ search: 'ТЕМН' })
    expect(found.map((b) => b.id).sort()).toEqual([byTitle.id, byText.id].sort())
  })

  it('counts live boards only', async () => {
    const api = v.media.moodboardsApi()
    await api.create({ title: 'Перша' })
    const second = await api.create({ title: 'Друга' })
    expect(await api.count()).toBe(2)
    await api.remove(second.id)
    expect(await api.count()).toBe(1)
  })

  it('pages without repeating rows; no limit lists them all', async () => {
    const api = v.media.moodboardsApi()
    for (let i = 0; i < 5; i++) await api.create({ title: `Добірка ${i}` })
    const first = await api.list({ limit: 2, offset: 0 })
    const second = await api.list({ limit: 2, offset: 2 })
    expect(second).toHaveLength(2)
    expect(second.some((b) => first.some((f) => f.id === b.id))).toBe(false)
    expect(await api.list({})).toHaveLength(5)
  })
})

describe('designTitleOf', () => {
  const at = new Date(2026, 10, 24, 19, 22).getTime()

  it('uses the own title, else the site, else when the shot was taken', () => {
    expect(designTitleOf({ title: 'Лендинг', sourceUrl: 'https://a.com', createdAt: at })).toBe(
      'Лендинг'
    )
    expect(
      designTitleOf({ title: '  ', sourceUrl: 'https://www.stripe.com/x', createdAt: at })
    ).toBe('stripe.com')
    expect(designTitleOf({ title: '', sourceUrl: 'linear.app/features', createdAt: at })).toBe(
      'linear.app'
    )
    expect(designTitleOf({ title: '', sourceUrl: '', createdAt: Date.now() })).toMatch(
      /^Знімок .+ о \d{2}:\d{2}$/
    )
  })

  it('names an untitled design the same way in search, pins and the trash (summary)', async () => {
    const d = await v.media.designsApi().create({ title: '' })
    const [summary] = v.registry.summarize([{ type: 'design', id: d.id }])
    expect(summary.title).toBe(designTitleOf(d))
    expect(summary.title).toMatch(/^Знімок /)
  })
})
