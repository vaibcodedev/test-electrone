/**
 * «Чи читається бекап»: what a backup holds, read back from its own bytes. A copy counts as good only when its
 * archive opens, its database opens read-only and passes quick_check, every table has as many rows as the
 * snapshot it was made from, and every attached file is there with the same size and CRC-32.
 * No Electron: unit-tested on real archives.
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { crc32 } from 'zlib'
import Database from 'better-sqlite3'
import { unzipAsync } from '../core/zip'

export const MANIFEST = 'manifest.json'
export const DB_ENTRY = 'vault.db'
const FILES_PREFIX = 'files/'

export interface BackupFacts {
  /** Rows per table of the database inside (FTS shadow tables included: they are part of the copy too). */
  rows: Record<string, number>
  /** `files/…` entry → `size:crc32`. */
  files: Record<string, string>
}

/** Thrown when a copy cannot be read or differs from its source: `detail` is technical, for the log. */
export class BackupCheckError extends Error {
  constructor(readonly detail: string) {
    super(`backup check failed: ${detail}`)
  }
}

const fileFact = (bytes: Uint8Array): string => `${bytes.length}:${crc32(bytes)}`

/** Opens the database read-only, checks it and counts the rows of every table. */
export function databaseRows(file: string): Record<string, number> {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const ok = db.pragma('quick_check', { simple: true })
    if (ok !== 'ok') throw new BackupCheckError(`quick_check: ${String(ok)}`)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
    const rows: Record<string, number> = {}
    for (const { name } of tables) {
      const quoted = `"${name.replace(/"/g, '""')}"`
      rows[name] = (db.prepare(`SELECT count(*) AS c FROM ${quoted}`).get() as { c: number }).c
    }
    return rows
  } finally {
    db.close()
  }
}

/** Facts of the files going into an archive (the bytes as read from the files folder). */
export function filesFacts(entries: Record<string, Uint8Array>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, bytes] of Object.entries(entries))
    if (name.startsWith(FILES_PREFIX)) out[name] = fileFact(bytes)
  return out
}

/** Reads a finished backup from its bytes; throws BackupCheckError when it isn't a readable Vault backup. */
export async function readBackupFacts(bytes: Uint8Array, tmpDir: string): Promise<BackupFacts> {
  let archive: Record<string, Uint8Array>
  try {
    archive = await unzipAsync(bytes)
  } catch (e) {
    throw new BackupCheckError(`not a readable zip: ${(e as Error).message}`)
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(new TextDecoder().decode(archive[MANIFEST]))
  } catch {
    throw new BackupCheckError('no readable manifest')
  }
  if ((manifest as { format?: unknown } | null)?.format !== 'vault-backup')
    throw new BackupCheckError('not a Vault backup manifest')
  const db = archive[DB_ENTRY]
  if (!db) throw new BackupCheckError('no vault.db in the archive')
  mkdirSync(tmpDir, { recursive: true })
  const probe = join(tmpDir, `verify-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.db`)
  writeFileSync(probe, db)
  try {
    return { rows: databaseRows(probe), files: filesFacts(archive) }
  } catch (e) {
    if (e instanceof BackupCheckError) throw e
    throw new BackupCheckError(`database does not open: ${(e as Error).message}`)
  } finally {
    rmSync(probe, { force: true })
  }
}

/** What differs between the source and its copy, one line each (table names and file paths only). */
export function diffFacts(expected: BackupFacts, actual: BackupFacts): string[] {
  const out: string[] = []
  const tables = new Set([...Object.keys(expected.rows), ...Object.keys(actual.rows)])
  for (const t of tables)
    if (expected.rows[t] !== actual.rows[t])
      out.push(`table ${t}: ${expected.rows[t] ?? 'none'} → ${actual.rows[t] ?? 'none'} rows`)
  const files = new Set([...Object.keys(expected.files), ...Object.keys(actual.files)])
  for (const f of files)
    if (expected.files[f] !== actual.files[f])
      out.push(`${f}: ${expected.files[f] ?? 'missing'} → ${actual.files[f] ?? 'missing'}`)
  return out
}

/** Reads the copy back and compares it with the source; throws BackupCheckError naming the first differences. */
export async function verifyBackup(
  bytes: Uint8Array,
  expected: BackupFacts,
  tmpDir: string
): Promise<void> {
  const diff = diffFacts(expected, await readBackupFacts(bytes, tmpDir))
  if (diff.length)
    throw new BackupCheckError(`${diff.length} difference(s): ${diff.slice(0, 5).join('; ')}`)
}
