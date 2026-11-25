/** Machine-level config outside the DB: seed ledger and once-a-day reminders survive a restart. */
import { describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { ConfigStore, DEFAULT_SETTINGS, seedOnce } from '@main/core/config-store'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const file = (): string => join(mkdtempSync(join(tmpdir(), 'vault-cfg-')), 'config.json')

describe('seedOnce', () => {
  it('seeds an empty table once; deleted seeds never come back', () => {
    const config = new ConfigStore(file())
    let seeded = 0
    seedOnce(
      config,
      'jobBoards',
      () => false,
      () => seeded++
    )
    seedOnce(
      config,
      'jobBoards',
      () => false,
      () => seeded++
    )
    expect(seeded).toBe(1)
  })

  it('a database that already has rows only gets marked', () => {
    const config = new ConfigStore(file())
    let seeded = 0
    seedOnce(
      config,
      'checklists',
      () => true,
      () => seeded++
    )
    expect(seeded).toBe(0)
    expect(config.isSeeded('checklists')).toBe(true)
  })
})

describe('persisted between launches', () => {
  it('the job reminder day and the seed ledger are read back from disk', () => {
    const path = file()
    const a = new ConfigStore(path)
    a.lastJobNudge = '2026-11-25'
    a.lastCardNudge = '2026-11-24'
    a.markSeeded('freelance')
    a.flush()
    const b = new ConfigStore(path)
    expect(b.lastJobNudge).toBe('2026-11-25')
    expect(b.lastCardNudge).toBe('2026-11-24')
    expect(b.isSeeded('freelance')).toBe(true)
  })
})

describe('a damaged config file', () => {
  it('one invalid setting resets only itself, the others are kept', () => {
    const path = file()
    writeFileSync(
      path,
      JSON.stringify({ settings: { backupKeep: 0, quickAddShortcut: 'Ctrl+Alt+V' } })
    )
    const config = new ConfigStore(path)
    expect(config.settings.quickAddShortcut).toBe('Ctrl+Alt+V')
    expect(config.settings.backupKeep).toBe(DEFAULT_SETTINGS.backupKeep)
  })

  it('unreadable JSON is kept aside before the defaults overwrite it', () => {
    const path = file()
    writeFileSync(path, '{ "secrets": { "capture": "abc" ')
    const config = new ConfigStore(path)
    expect(config.settings).toEqual(DEFAULT_SETTINGS)
    expect(readdirSync(dirname(path)).some((f) => f.startsWith('config.json.broken-'))).toBe(true)
  })

  it.each([['null'], ['[]'], ['42']])(
    'valid JSON that is not an object (%s) starts from defaults and is kept aside',
    (text) => {
      const path = file()
      writeFileSync(path, text)
      const config = new ConfigStore(path)
      expect(config.settings).toEqual(DEFAULT_SETTINGS)
      expect(readdirSync(dirname(path)).some((f) => f.startsWith('config.json.broken-'))).toBe(true)
    }
  )

  it('a file locked at start is never overwritten: the keys in it survive', () => {
    const path = file()
    const original = JSON.stringify({ secrets: { github: 'encrypted' }, seeded: ['jobBoards'] })
    writeFileSync(path, original)
    const busy = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    const read = vi.mocked(fs.readFileSync)
    read.mockImplementationOnce(() => {
      throw busy
    })
    read.mockImplementationOnce(() => {
      throw busy
    })
    const config = new ConfigStore(path)
    expect(config.settings).toEqual(DEFAULT_SETTINGS)
    config.updateSettings({ userName: 'Олена' })
    config.flush()
    expect(readFileSync(path, 'utf8')).toBe(original)
    expect(readdirSync(dirname(path)).some((f) => f.startsWith('config.json.broken-'))).toBe(false)
  })

  it('a file locked for a moment is read on the second try', () => {
    const path = file()
    writeFileSync(path, JSON.stringify({ settings: { userName: 'Олена' } }))
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
    })
    expect(new ConfigStore(path).settings.userName).toBe('Олена')
  })
})

describe('«Налаштування → Меню» in config.json', () => {
  it('an older config without the keys shows every section', () => {
    const path = file()
    writeFileSync(path, JSON.stringify({ settings: { userName: 'Олена' } }))
    const config = new ConfigStore(path)
    expect(config.settings.hiddenNavHubs).toEqual([])
    expect(config.settings.hiddenNavItems).toEqual([])
  })

  it('a broken list resets only itself', () => {
    const path = file()
    writeFileSync(
      path,
      JSON.stringify({
        settings: { hiddenNavHubs: 'x', hiddenNavItems: ['/jobs/stats'], theme: 'dark' }
      })
    )
    const config = new ConfigStore(path)
    expect(config.settings.hiddenNavHubs).toEqual([])
    expect(config.settings.hiddenNavItems).toEqual(['/jobs/stats'])
    expect(config.settings.theme).toBe('dark')
  })

  it('hidden sections are saved and read back', () => {
    const path = file()
    const config = new ConfigStore(path)
    config.updateSettings({ hiddenNavHubs: ['jobs'] })
    config.flush()
    const again = new ConfigStore(path)
    expect(again.settings.hiddenNavHubs).toEqual(['jobs'])
    expect(again.settings.hiddenNavItems).toEqual([])
  })
})
