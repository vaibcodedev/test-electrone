/**
 * Backup restore on a real database: whatever fails half-way, the user's current data stays as it was.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs, {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'fs'
import fsp from 'fs/promises'
import { syncBuiltinESMExports } from 'module'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { readBackupFacts } from '@main/services/backup-verify'
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
    if (busy?.(String(from)))
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
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
    Notification: { isSupported: () => false },
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

  it('the current database is put back even when its file stays locked for a moment', async () => {
    const file = await backupWithOneBoard()
    mkdirSync(paths.filesDir, { recursive: true })
    let lockedTries = 2
    // The files folder can't move (restore fails), then the rename of the old database back is refused twice.
    busy = (from) =>
      from === paths.filesDir || (from.includes('db-before-restore-') && lockedTries-- > 0)
    await expect(backups.restore(file)).rejects.toThrow(/Поточні дані залишилися як були/)
    expect(lockedTries).toBeLessThan(0)
    expect(boardTitles().sort()).toEqual(['З бекапу', 'Після бекапу'])
  })

  it('a stale «.part» left by a quit mid-write is removed, a fresh one is not', async () => {
    mkdirSync(paths.backupsDir, { recursive: true })
    const stale = join(paths.backupsDir, 'vault-old.vaultbak.part')
    const fresh = join(paths.backupsDir, 'vault-now.vaultbak.part')
    writeFileSync(stale, 'x')
    writeFileSync(fresh, 'x')
    const twoHoursAgo = (Date.now() - 2 * 3600_000) / 1000
    utimesSync(stale, twoHoursAgo, twoHoursAgo)
    await backups.create({ saveAs: false })
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
  })
})

describe('auto backup', () => {
  afterEach(() => {
    backups.stop()
    vi.useRealTimers()
  })

  it('skips its turn quietly while a manual backup is running', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const bus = new EventBus()
    const toasts: unknown[] = []
    vi.spyOn(bus, 'emit').mockImplementation((event, payload) => {
      if (event === 'toast') toasts.push(payload)
    })
    backups = new BackupService(v.db, paths, config, v.search, bus)
    backups.startAuto()
    const manual = backups.create({ saveAs: false })
    vi.advanceTimersByTime(20_000)
    await manual
    await Promise.resolve()
    expect(toasts).toEqual([])
    expect(backups.list()).toHaveLength(1)
  })

  it('a second restore while one is running is refused', async () => {
    const file = await backupWithOneBoard()
    const first = backups.restore(file)
    await expect(backups.restore(file)).rejects.toThrow('Відновлення вже виконується')
    await expect(first).resolves.toBe(true)
  })
})

describe('a new backup is checked before rotation', () => {
  it('a backup that does not read back is removed and the older ones stay', async () => {
    config.updateSettings({ backupKeep: 1 })
    const first = (await backups.create({ saveAs: false }))!.path
    await new Promise((r) => setTimeout(r, 1100)) // a new name (stamped to the second)
    // The disk returns garbage for the new file: the check fails.
    const realRead = fs.readFileSync
    fs.readFileSync = ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) =>
      String(p).startsWith(paths.backupsDir) && String(p).endsWith('.vaultbak') && String(p) !== first
        ? Buffer.from('broken')
        : (realRead as (...a: unknown[]) => unknown)(p, ...rest)) as typeof fs.readFileSync
    syncBuiltinESMExports()
    try {
      await expect(backups.create({ saveAs: false })).rejects.toThrow(/не пройшов перевірку/)
    } finally {
      fs.readFileSync = realRead
      syncBuiltinESMExports()
    }
    expect(backups.list().map((b) => b.path)).toEqual([first])
  })
})

describe('«Папка для копій»', () => {
  let folder: string
  let toasts: { kind: string; message: string }[]
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vault-folder-'))
    const bus = new EventBus()
    toasts = []
    vi.spyOn(bus, 'emit').mockImplementation((event, payload) => {
      if (event === 'toast') toasts.push(payload as { kind: string; message: string })
    })
    backups = new BackupService(v.db, paths, config, v.search, bus, { folderCopies: true, hostname: 'Test-PC' })
  })
  afterEach(() => rmSync(folder, { recursive: true, force: true }))

  const own = (): string[] => readdirSync(folder).filter((f) => /^vault-test-pc-[0-9a-f]{8}-/.test(f)).sort()

  it('copies the backup, reads it back as a Vault backup and records the success', async () => {
    await backups.useFolder(folder)
    v.boards.createBoard({ title: 'У хмарі' })
    await backups.create({ saveAs: false })
    await backups.syncFolder('manual')
    expect(own()).toHaveLength(1)
    expect(readdirSync(folder).some((f) => f.endsWith('.part'))).toBe(false)
    const facts = await readBackupFacts(readFileSync(join(folder, own()[0])), paths.tmpDir)
    expect(facts.rows.boards).toBe(1)
    const info = backups.folderInfo()
    expect(info.path).toBe(folder)
    expect(info.lastOkAt).not.toBeNull()
    expect(info.lastError).toBeNull()
    expect(toasts.map((t) => t.kind)).toEqual(['success'])
  })

  it('keeps backupFolderKeep own copies; another computer’s copies and other files stay', async () => {
    await backups.useFolder(folder)
    const id = config.backupFolder.machineId!
    for (let d = 1; d <= 4; d++) writeFileSync(join(folder, `vault-test-pc-${id}-2026-01-0${d}_10-00-00.vaultbak`), 'old')
    const foreign = ['vault-laptop-0f0f0f0f-2026-01-01_10-00-00.vaultbak', 'Мої документи.docx']
    foreign.forEach((f) => writeFileSync(join(folder, f), 'theirs'))
    config.updateSettings({ backupFolderKeep: 2 })
    await backups.create({ saveAs: false })
    await backups.syncFolder('auto')
    expect(own()).toHaveLength(2)
    expect(own()[0]).toBe(`vault-test-pc-${id}-2026-01-04_10-00-00.vaultbak`)
    for (const f of foreign) expect(readFileSync(join(folder, f), 'utf8')).toBe('theirs')
  })

  it('a copy that fails the check is removed and no older copy goes', async () => {
    const id = 'abcdef01'
    config.updateBackupFolder({ machineId: id })
    for (let d = 1; d <= 3; d++) writeFileSync(join(folder, `vault-test-pc-${id}-2026-01-0${d}_10-00-00.vaultbak`), 'old')
    config.updateSettings({ backupFolderKeep: 1 })
    await backups.create({ saveAs: false }) // no folder yet: nothing copied
    // The cloud client hands back something else than was written.
    const realRead = fsp.readFile
    fsp.readFile = (async (p: Parameters<typeof fsp.readFile>[0], ...rest: unknown[]) =>
      String(p).startsWith(folder)
        ? Buffer.from('not a zip')
        : (realRead as (...a: unknown[]) => Promise<unknown>)(p, ...rest)) as typeof fsp.readFile
    syncBuiltinESMExports()
    try {
      await backups.useFolder(folder) // copies the newest backup at once
      await backups.syncFolder('auto')
    } finally {
      fsp.readFile = realRead
      syncBuiltinESMExports()
    }
    expect(own()).toEqual([1, 2, 3].map((d) => `vault-test-pc-${id}-2026-01-0${d}_10-00-00.vaultbak`))
    expect(backups.folderInfo().lastError?.message).toMatch(/не пройшла перевірку/)
  })

  it('an unplugged folder: the local backup is made, the error is recorded, the folder is not re-created', async () => {
    await backups.useFolder(folder)
    rmSync(folder, { recursive: true, force: true })
    const entry = await backups.create({ saveAs: false }, 'auto')
    await backups.syncFolder('auto')
    expect(entry).not.toBeNull()
    expect(backups.list()).toHaveLength(1)
    expect(existsSync(folder)).toBe(false)
    expect(backups.folderInfo().lastError?.message).toMatch(/недоступна — підключіть диск/)
    expect(toasts).toHaveLength(1)
    // Retried hourly, reported once a day.
    await backups.syncFolder('auto')
    expect(toasts).toHaveLength(1)
    // Back again: the same backup reaches the folder and the error is gone.
    mkdirSync(folder)
    await backups.syncFolder('auto')
    expect(own()).toHaveLength(1)
    expect(backups.folderInfo().lastError).toBeNull()
  })

  it('refuses a folder inside the data folder; the sandbox refuses any folder', async () => {
    await expect(backups.useFolder(paths.backupsDir)).rejects.toThrow(/всередині папки даних Vault/)
    expect(backups.folderInfo().path).toBeNull()
    const sandbox = new BackupService(v.db, paths, config, v.search, new EventBus(), { folderCopies: false })
    await expect(sandbox.chooseFolder()).rejects.toThrow(/тестовому режимі/)
    expect(sandbox.folderInfo().enabled).toBe(false)
  })

  it('«Не копіювати» stops the copies and leaves the old ones in place', async () => {
    await backups.useFolder(folder)
    await backups.create({ saveAs: false })
    await backups.syncFolder('manual')
    backups.resetFolder()
    expect(backups.folderInfo().path).toBeNull()
    expect(own()).toHaveLength(1)
  })
})

describe('«Видалити старі» (Сховище)', () => {
  /** Files with mtimes one minute apart: index 0 is the newest. */
  function seed(): void {
    const t0 = Date.now() - 10 * 60_000
    const put = (name: string, minutesAgo: number): void => {
      const abs = join(paths.backupsDir, name)
      writeFileSync(abs, Buffer.alloc(10))
      const t = new Date(t0 - minutesAgo * 60_000)
      utimesSync(abs, t, t)
    }
    for (let i = 0; i < 5; i++) put(`vault-2026-01-0${i + 1}_00-00-00.vaultbak`, i)
    for (let i = 0; i < 3; i++) put(`vault-pre-restore-2026-01-0${i + 1}_00-00-00.vaultbak`, i)
    for (let i = 0; i < 3; i++) put(`pre-update-0.1.0-beta.${i}-123.db`, i)
    put('vault-fresh.vaultbak.part', -9) // written right now
    put('vault-old.vaultbak.part', 120) // left by a quit two hours ago
    put('notes.txt', 1000)
  }
  const names = (plan: { path: string }[]): string[] => plan.map((p) => basename(p.path)).sort()

  beforeEach(() => {
    config.updateSettings({ backupKeep: 2 })
    seed()
  })

  it('plans the backups beyond backupKeep, older safety copies and stale «.part» only', () => {
    expect(names(backups.prunePlan())).toEqual(
      [
        'vault-2026-01-03_00-00-00.vaultbak',
        'vault-2026-01-04_00-00-00.vaultbak',
        'vault-2026-01-05_00-00-00.vaultbak',
        'vault-pre-restore-2026-01-02_00-00-00.vaultbak',
        'vault-pre-restore-2026-01-03_00-00-00.vaultbak',
        'vault-old.vaultbak.part'
      ].sort()
    )
  })

  it('removes exactly the plan: pre-update copies and unknown files stay', async () => {
    const plan = backups.prunePlan()
    const freed = await backups.pruneOld()
    expect(freed).toEqual({ freedBytes: plan.length * 10, removed: plan.length })
    expect(readdirSync(paths.backupsDir).sort()).toEqual(
      [
        'notes.txt',
        'pre-update-0.1.0-beta.0-123.db',
        'pre-update-0.1.0-beta.1-123.db',
        'pre-update-0.1.0-beta.2-123.db',
        'vault-2026-01-01_00-00-00.vaultbak',
        'vault-2026-01-02_00-00-00.vaultbak',
        'vault-fresh.vaultbak.part',
        'vault-pre-restore-2026-01-01_00-00-00.vaultbak'
      ].sort()
    )
  })

  it('is refused while a backup runs, and a backup waits for it', async () => {
    const creating = backups.create({ saveAs: false })
    await expect(backups.pruneOld()).rejects.toThrow(
      'Зачекайте, поки завершиться бекап, і спробуйте ще раз'
    )
    await creating
    const pruning = backups.pruneOld()
    await expect(backups.create({ saveAs: false })).rejects.toThrow('Бекап уже виконується')
    await pruning
  })
})
