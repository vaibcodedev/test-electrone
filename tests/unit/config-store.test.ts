/** Machine-level config outside the DB: seed ledger and once-a-day reminders survive a restart. */
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ConfigStore, seedOnce } from '@main/core/config-store'

const file = (): string => join(mkdtempSync(join(tmpdir(), 'vault-cfg-')), 'config.json')

describe('seedOnce (main-b-10)', () => {
  it('seeds an empty table once; deleted seeds never come back', () => {
    const config = new ConfigStore(file())
    let seeded = 0
    seedOnce(config, 'jobBoards', () => false, () => seeded++)
    seedOnce(config, 'jobBoards', () => false, () => seeded++)
    expect(seeded).toBe(1)
  })

  it('a database that already has rows only gets marked', () => {
    const config = new ConfigStore(file())
    let seeded = 0
    seedOnce(config, 'checklists', () => true, () => seeded++)
    expect(seeded).toBe(0)
    expect(config.isSeeded('checklists')).toBe(true)
  })
})

describe('persisted between launches (main-b-20)', () => {
  it('the job reminder day and the seed ledger are read back from disk', () => {
    const path = file()
    const a = new ConfigStore(path)
    a.lastJobNudge = '2026-11-25'
    a.markSeeded('freelance')
    a.flush()
    const b = new ConfigStore(path)
    expect(b.lastJobNudge).toBe('2026-11-25')
    expect(b.isSeeded('freelance')).toBe(true)
  })
})
