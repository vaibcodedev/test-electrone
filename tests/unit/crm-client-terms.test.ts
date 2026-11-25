import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('client default terms', () => {
  it('a client made without terms takes the first project’s', async () => {
    const c = await v.api.clients.create({ name: 'Acme' })
    expect(c.defaultRate).toBe(0)
    await v.api.projects.create({
      title: 'Сайт',
      clientId: c.id,
      billing: 'hourly',
      rate: 40,
      currency: 'EUR'
    })
    const after = await v.api.clients.get(c.id)
    expect(after).toMatchObject({ defaultBilling: 'hourly', defaultRate: 40, currency: 'EUR' })
  })

  it('terms already set stay, whatever the next project says', async () => {
    const c = await v.api.clients.create({
      name: 'Beta',
      defaultBilling: 'retainer',
      defaultRate: 1500,
      currency: 'USD'
    })
    await v.api.projects.create({ title: 'Інше', clientId: c.id, billing: 'fixed', fixedPrice: 300 })
    expect(await v.api.clients.get(c.id)).toMatchObject({
      defaultBilling: 'retainer',
      defaultRate: 1500
    })
  })

  it('a project without an amount or unpaid teaches nothing', async () => {
    const c = await v.api.clients.create({ name: 'Gamma' })
    await v.api.projects.create({ title: 'Без суми', clientId: c.id, billing: 'fixed' })
    await v.api.projects.create({ title: 'Безкоштовно', clientId: c.id, billing: 'none' })
    expect(await v.api.clients.get(c.id)).toMatchObject({ defaultBilling: 'fixed', defaultRate: 0 })
  })
})
