/** Designs on a real database: the background palette fill-in must not look like an edit. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openVault, type Vault } from './support/vault'

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
