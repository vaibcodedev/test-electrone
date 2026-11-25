/**
 * Backup restore on a real database: whatever fails half-way, the user's current data stays as it was.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs, { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { syncBuiltinESMExports } from 'module'
import { join } from 'path'
import { AppPaths } from '@main/core/paths'
import { ConfigStore } from '@main/core/config-store'
import { EventBus } from '@main/core/event-bus'
import { BackupService } from '@main/services/backup-service'
import { openVault, type Vault } from './support/vault'

/** A rename that fails like Windows does when an antivirus or Explorer holds the file. */
let busy: null | ((from: string) => boolean) = null
const realRename = fs.renameSync
beforeAll(() => {
  fs.renameSync = (from, to) => {
    if (busy?.(String(from))) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    realRename(from, to)
  }
  syncBuiltinESMExports()
})
afterAll(() => {
  fs.renameSync = realRename
  syncBuiltinESMExports()
})

vi.mock('electron', async () => {
  const { electronMock } = await import('./support/electron-mock')
  return {
    ...electronMock,
    BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
    dialog: { showMessageBox: async () => ({ response: 0 }) }
  }
})
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
let paths: AppPaths
let config: ConfigStore
let backups: BackupService

beforeEach(() => {
  v = openVault()
  paths = new AppPaths(v.dir)
  config = new ConfigStore(join(v.dir, 'config.json'))
  backups = new BackupService(v.db, paths, config, v.search, new EventBus())
})
afterEach(() => {
  busy = null
  config.flush()
  v.close()
})

const boardTitles = (): string[] => v.boards.listBoards().map((b) => b.title)

async function backupWithOneBoard(): Promise<string> {
  v.boards.createBoard({ title: 'З бекапу' })
  const entry = await backups.create({ saveAs: false })
  v.boards.createBoard({ title: 'Після бекапу' })
  return entry!.path
}

describe('backup restore', () => {
  it('replaces the database with the one from the backup', async () => {
    const file = await backupWithOneBoard()
    await expect(backups.restore(file)).resolves.toBe(true)
    expect(boardTitles()).toEqual(['З бекапу'])
  })

  it('a locked database file is left in place, not deleted by the rollback', async () => {
    const file = await backupWithOneBoard()
    busy = (from) => from === paths.dbFile
    await expect(backups.restore(file)).rejects.toThrow(/використовує інша програма/)
    expect(boardTitles().sort()).toEqual(['З бекапу', 'Після бекапу'])
  })

  it('a locked files folder rolls the database back and keeps the files', async () => {
    const file = await backupWithOneBoard()
    mkdirSync(paths.filesDir, { recursive: true })
    writeFileSync(join(paths.filesDir, 'mine.png'), 'x')
    busy = (from) => from === paths.filesDir
    await expect(backups.restore(file)).rejects.toThrow(/Поточні дані залишилися як були/)
    expect(boardTitles().sort()).toEqual(['З бекапу', 'Після бекапу'])
    expect(readFileSync(join(paths.filesDir, 'mine.png'), 'utf8')).toBe('x')
  })

  it('a file that is not a backup is a readable error', async () => {
    const file = join(v.dir, 'broken.vaultbak')
    writeFileSync(file, 'not a zip')
    await expect(backups.restore(file)).rejects.toThrow('Файл пошкоджений або це не бекап Vault')
    expect(existsSync(paths.dbFile)).toBe(true)
  })

  it('a finished backup leaves no «.part» file behind', async () => {
    await backups.create({ saveAs: false })
    expect(readdirSync(paths.backupsDir).filter((f) => f.endsWith('.part'))).toEqual([])
    expect(backups.list()).toHaveLength(1)
  })
})
