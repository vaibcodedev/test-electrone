/**
 * DB-level checks under plain Node: better-sqlite3 v13 ships N-API prebuilds, so the same binary loads here
 * and in Electron. Business flows through modules/services are covered by the e2e suite (they need the
 * whole container, which depends on Electron APIs).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

vi.mock('@main/core/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { DbContext } = await import('@main/db/client')
const MIGRATIONS = resolve('src/main/db/migrations')

describe('DbContext on a fresh database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-unit-'))
  const db = new DbContext(join(dir, 'vault.db'), MIGRATIONS, join(dir, 'backups'), 'test')

  beforeAll(() => db.open())
  afterAll(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('applies every migration', () => {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as {
      entries: unknown[]
    }
    const applied = (
      db.sqlite.prepare('SELECT count(*) AS c FROM __drizzle_migrations').get() as { c: number }
    ).c
    expect(applied).toBe(journal.entries.length)
  })

  it('foreign keys are enforced', () => {
    expect(db.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('ulower() folds Cyrillic (SQLite lower() only folds ASCII)', () => {
    const row = db.sqlite
      .prepare("SELECT lower('Здача') AS plain, ulower('Здача ҐЄІЇ') AS u")
      .get() as { plain: string; u: string }
    expect(row.plain).toBe('Здача')
    expect(row.u).toBe('здача ґєії')
  })

  it('LIKE over ulower() finds «Здача…» by «зд»', () => {
    const r = db.sqlite
      .prepare("SELECT ulower('Здача роботи') LIKE ulower(?) ESCAPE '\\' AS m")
      .get('%зД%') as { m: number }
    expect(r.m).toBe(1)
  })

  it('reopening runs no migrations and makes no safety copy', () => {
    db.close()
    db.open()
    const backups = (() => {
      try {
        return readdirSync(join(dir, 'backups'))
      } catch {
        return []
      }
    })()
    expect(backups).toEqual([])
  })
})

describe('migrations safety (CLAUDE.md: never recreate a table referenced by ON DELETE CASCADE)', () => {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const all = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n')
  const cascadeParents = new Set(
    [...all.matchAll(/REFERENCES\s+[`"]?(\w+)[`"]?\s*\([^)]*\)[^,\n]*ON DELETE cascade/gi)].map(
      (m) => m[1].toLowerCase()
    )
  )

  it('there are cascade parents to protect', () => {
    expect(cascadeParents.size).toBeGreaterThan(0)
  })

  it.each(files.filter((f) => !f.startsWith('0000')))('%s drops no cascade-parent table', (f) => {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
    const dropped = [...sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?[`"]?(\w+)[`"]?/gi)].map((m) =>
      m[1].toLowerCase()
    )
    expect(dropped.filter((t) => cascadeParents.has(t))).toEqual([])
  })
})
