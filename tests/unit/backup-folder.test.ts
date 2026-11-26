/**
 * «Папка для копій» is the person's own folder: rotation removes only this installation's finished copies and its
 * stale «.part» files, a missing folder is never re-created, a folder inside Vault's data is refused.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  assertUsableFolder,
  copyName,
  folderErrorMessage,
  machineTag,
  ownCopyPattern,
  removeOwnCopy,
  rotateCopies,
  writeCopy
} from '@main/services/backup-folder'

let dir: string
const me = machineTag('Робочий-PC (дім)', 'a1b2c3d4')
const other = machineTag('laptop', '0f0f0f0f')
const stamp = (day: number): string => `2026-01-${String(day).padStart(2, '0')}_10-00-00`

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vault-copies-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const put = (name: string, content = 'x'): string => {
  const abs = join(dir, name)
  writeFileSync(abs, content)
  return abs
}

describe('names', () => {
  it('a computer name becomes a safe slug; the pattern matches only its own finished copies', () => {
    expect(me.host).toBe('pc')
    expect(machineTag('DESKTOP-7QK2', 'a1b2c3d4').host).toBe('desktop-7qk2')
    const name = copyName(me, stamp(1))
    expect(name).toBe('vault-pc-a1b2c3d4-2026-01-01_10-00-00.vaultbak')
    const own = ownCopyPattern(me)
    expect(own.test(name)).toBe(true)
    expect(own.test(`${name}.part`)).toBe(false)
    expect(own.test(copyName(other, stamp(1)))).toBe(false)
    expect(own.test('vault-2026-01-01_10-00-00.vaultbak')).toBe(false)
    expect(own.test(`x${name}`)).toBe(false)
  })
})

describe('rotation', () => {
  it('keeps the newest own copies by the stamp in the name and never touches anything else', async () => {
    for (let d = 1; d <= 5; d++) put(copyName(me, stamp(d)))
    // A cloud client rewrote the mtimes: the newest by mtime is the oldest copy.
    const t = new Date()
    utimesSync(join(dir, copyName(me, stamp(1))), t, t)
    const foreign = [
      copyName(other, stamp(1)),
      copyName(other, stamp(2)),
      'vault-2026-01-01_10-00-00.vaultbak',
      'notes.txt',
      `${copyName(me, stamp(9))}.bak`
    ]
    foreign.forEach((n) => put(n))
    // A folder and a junction named like own copies are not files: never removed, never followed.
    mkdirSync(join(dir, copyName(me, stamp(0))))
    writeFileSync(join(dir, copyName(me, stamp(0)), 'inside.txt'), 'keep')
    const target = mkdtempSync(join(tmpdir(), 'vault-target-'))
    writeFileSync(join(target, 'precious.txt'), 'keep')
    symlinkSync(target, join(dir, copyName(me, stamp(6).replace('2026', '2025'))), 'junction')

    const removed = await rotateCopies(dir, me, 2)
    expect(removed.sort()).toEqual([copyName(me, stamp(1)), copyName(me, stamp(2)), copyName(me, stamp(3))].sort())
    const left = readdirSync(dir)
    for (const n of [...foreign, copyName(me, stamp(4)), copyName(me, stamp(5))]) expect(left).toContain(n)
    expect(existsSync(join(dir, copyName(me, stamp(0)), 'inside.txt'))).toBe(true)
    expect(existsSync(join(target, 'precious.txt'))).toBe(true)
    rmSync(target, { recursive: true, force: true })
  })

  it('removes its own stale «.part» only; a fresh one and another computer’s stay', async () => {
    const stale = put(`${copyName(me, stamp(1))}.part`)
    const fresh = put(`${copyName(me, stamp(2))}.part`)
    const otherStale = put(`${copyName(other, stamp(1))}.part`)
    const old = (Date.now() - 2 * 3600_000) / 1000
    utimesSync(stale, old, old)
    utimesSync(otherStale, old, old)
    await rotateCopies(dir, me, 10)
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
    expect(existsSync(otherStale)).toBe(true)
  })

  it('never removes the newest copy, even with keep 0', async () => {
    put(copyName(me, stamp(1)))
    expect(await rotateCopies(dir, me, 0)).toEqual([])
  })

  it('removeOwnCopy refuses a name that is not its own', async () => {
    const foreign = put(copyName(other, stamp(1)))
    await removeOwnCopy(dir, me, copyName(other, stamp(1)))
    expect(existsSync(foreign)).toBe(true)
  })
})

describe('writing a copy', () => {
  it('ends as the finished name with no «.part» left, and never replaces an existing copy', async () => {
    const name = copyName(me, stamp(1))
    await writeCopy(dir, name, new Uint8Array([1, 2, 3]))
    expect(readdirSync(dir)).toEqual([name])
    await expect(writeCopy(dir, name, new Uint8Array([9]))).rejects.toThrow()
    expect(readdirSync(dir)).toEqual([name])
  })

  it('a folder that is gone fails and is not re-created', async () => {
    const gone = join(dir, 'unplugged')
    await expect(writeCopy(gone, copyName(me, stamp(1)), new Uint8Array([1]))).rejects.toThrow()
    expect(existsSync(gone)).toBe(false)
  })
})

describe('choosing the folder', () => {
  it('refuses a missing folder with words for the person and does not create it', async () => {
    const gone = join(dir, 'D-drive')
    await expect(assertUsableFolder(gone, [])).rejects.toThrow(/недоступна — підключіть диск/)
    expect(existsSync(gone)).toBe(false)
  })

  it('refuses a folder inside Vault’s data, also through a junction', async () => {
    const data = join(dir, 'data')
    mkdirSync(join(data, 'backups'), { recursive: true })
    await expect(assertUsableFolder(join(data, 'backups'), [data])).rejects.toThrow(/всередині папки даних Vault/)
    const link = join(dir, 'looks-elsewhere')
    symlinkSync(data, link, 'junction')
    await expect(assertUsableFolder(link, [data])).rejects.toThrow(/всередині папки даних Vault/)
    await expect(assertUsableFolder(dir, [data])).resolves.toBeUndefined()
  })

  it('explains a full disk and a denied folder', () => {
    expect(folderErrorMessage(Object.assign(new Error('x'), { code: 'ENOSPC' }), 'E:\\B')).toMatch(/закінчилося місце/)
    expect(folderErrorMessage(Object.assign(new Error('x'), { code: 'EACCES' }), 'E:\\B')).toMatch(/перевірте доступ/)
    expect(folderErrorMessage(Object.assign(new Error('x'), { code: 'ENOENT' }), 'E:\\B')).toMatch(/недоступна/)
  })
})
