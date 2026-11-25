/** Freelance proposals on a real database: «Найняли» turns a proposal into a contract once. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('proposal → contract', () => {
  it('a second «hire» (double click, retry) creates no second project or client', async () => {
    const platform = await v.api.platforms.create({ name: 'Upwork' })
    const p = await v.api.proposals.create({ platformId: platform.id, jobTitle: 'Лендинг', clientName: 'Acme' })
    const hire = { proposalId: p.id, title: 'Лендинг', billing: 'fixed' as const, amount: 500, feePercent: 10 }
    await v.api.proposals.hire(hire)
    await expect(v.api.proposals.hire(hire)).rejects.toThrow(/уже перетворено/)
    expect(await v.api.projects.list()).toHaveLength(1)
    expect(await v.api.clients.list()).toHaveLength(1)
  })

  it('an unknown client id is a readable error, not a foreign key failure', async () => {
    const platform = await v.api.platforms.create({ name: 'Upwork' })
    const p = await v.api.proposals.create({ platformId: platform.id, jobTitle: 'Лендинг' })
    await expect(
      v.api.proposals.hire({ proposalId: p.id, clientId: 'missing', title: 'X', billing: 'fixed', amount: 1, feePercent: 0 })
    ).rejects.toThrow(/не знайдено/)
  })

  it('a client in the trash is not reused: the contract gets a new, visible client', async () => {
    const platform = await v.api.platforms.create({ name: 'Upwork' })
    const old = await v.api.clients.create({ name: 'Acme' })
    const p = await v.api.proposals.create({ platformId: platform.id, jobTitle: 'Лендинг', clientName: 'Acme', clientId: old.id })
    await v.api.clients.remove(old.id)
    const { projectId, clientId } = await v.api.proposals.hire({ proposalId: p.id, title: 'Лендинг', billing: 'fixed', amount: 500, feePercent: 10 })
    expect(clientId).not.toBe(old.id)
    expect((await v.api.projects.details(projectId))?.client?.id).toBe(clientId)
  })
})
