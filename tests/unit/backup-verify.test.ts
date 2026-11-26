/** A copy is good only if its database opens with the same rows per table and every file is there unchanged. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { zipSync } from 'fflate'
import { BackupCheckError, databaseRows, filesFacts, readBackupFacts, verifyBackup } from '@main/services/backup-verify'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vault-verify-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function database(rows: number): Uint8Array {
  const file = join(dir, `db-${rows}-${Math.random()}.db`)
  const db = new Database(file)
  db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT)')
  for (let i = 0; i < rows; i++) db.prepare('INSERT INTO notes (title) VALUES (?)').run(`n${i}`)
  db.close()
  return readFileSync(file)
}

const archive = (db: Uint8Array, files: Record<string, Uint8Array>): Uint8Array =>
  zipSync({
    'manifest.json': new TextEncoder().encode(JSON.stringify({ format: 'vault-backup' })),
    'vault.db': db,
    ...files
  })

describe('backup check', () => {
  const pic = { 'files/a/pic.png': new Uint8Array([1, 2, 3]) }

  it('reads rows and files back from the archive', async () => {
    const facts = await readBackupFacts(archive(database(3), pic), dir)
    expect(facts.rows.notes).toBe(3)
    expect(facts.files).toEqual(filesFacts(pic))
  })

  it('a copy with fewer rows, a changed file or a missing file fails', async () => {
    const expected = { rows: { notes: 3 }, files: filesFacts(pic) }
    await expect(verifyBackup(archive(database(3), pic), expected, dir)).resolves.toBeUndefined()
    await expect(verifyBackup(archive(database(2), pic), expected, dir)).rejects.toThrow(/notes: 3 → 2/)
    await expect(
      verifyBackup(archive(database(3), { 'files/a/pic.png': new Uint8Array([1, 2, 4]) }), expected, dir)
    ).rejects.toThrow(BackupCheckError)
    await expect(verifyBackup(archive(database(3), {}), expected, dir)).rejects.toThrow(/missing/)
  })

  it('garbage, a zip without a database and a broken database fail', async () => {
    await expect(readBackupFacts(new Uint8Array([1, 2, 3]), dir)).rejects.toThrow(BackupCheckError)
    await expect(readBackupFacts(zipSync({ 'manifest.json': new TextEncoder().encode('{"format":"vault-backup"}') }), dir)).rejects.toThrow(/no vault.db/)
    const broken = database(50)
    broken.fill(7, 4096) // pages after the header overwritten
    await expect(readBackupFacts(archive(broken, {}), dir)).rejects.toThrow(BackupCheckError)
  })

  it('counts the rows of a database opened read-only', () => {
    const file = join(dir, 'x.db')
    const db = new Database(file)
    db.exec("CREATE TABLE \"we\"\"ird\" (x); INSERT INTO \"we\"\"ird\" VALUES (1), (2)")
    db.close()
    expect(databaseRows(file)).toEqual({ 'we"ird': 2 })
  })
})
