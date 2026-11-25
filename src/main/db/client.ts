import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { log } from '../core/logger'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type Orm = BetterSQLite3Database<typeof schema>

/**
 * Owns the SQLite connection. Services always go through `ctx.orm` / `ctx.sqlite`
 * (never cache them) so the connection can be swapped when a backup is restored.
 */
export class DbContext {
  private _sqlite: Database.Database | null = null
  private _orm: Orm | null = null

  constructor(
    private readonly file: string,
    private readonly migrationsDir: string,
    /** Where to put a safety copy before schema changes; null = no copy. */
    private readonly backupDir: string | null = null,
    private readonly appVersion = ''
  ) {}

  /** Migrations the last open() applied to an existing database (0 — none): startup backfills after an update. */
  migratedOnOpen = 0

  /** Number of migrations shipped with this version vs. applied to the DB. */
  private pendingMigrations(sqlite: Database.Database): number {
    try {
      const journal = JSON.parse(readFileSync(join(this.migrationsDir, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] }
      const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get()
      if (!table) return 0 // brand-new database: nothing to protect
      const applied = (sqlite.prepare('SELECT count(*) AS c FROM __drizzle_migrations').get() as { c: number }).c
      return Math.max(0, journal.entries.length - applied)
    } catch (e) {
      log.warn('[db] cannot read migration journal', e)
      return 0
    }
  }

  /** Consistent copy of the DB before applying new migrations (keeps the last 5). */
  private backupBeforeMigrate(sqlite: Database.Database, pending: number): void {
    if (!this.backupDir || !pending) return
    mkdirSync(this.backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const target = join(this.backupDir, `pre-update-${this.appVersion || 'dev'}-${stamp}.db`)
    sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    log.info(`[db] ${pending} new migration(s): safety copy saved to ${target}`)
    const old = readdirSync(this.backupDir).filter((f) => f.startsWith('pre-update-') && f.endsWith('.db')).sort().reverse()
    for (const f of old.slice(5)) rmSync(join(this.backupDir, f), { force: true })
  }

  open(): void {
    const sqlite = new Database(this.file)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('busy_timeout = 5000')
    // SQLite lower() folds ASCII only: «Сдача» stayed «Сдача» and «сд» never matched. Unicode-aware twin for search.
    sqlite.function('ulower', { deterministic: true }, (v: unknown) =>
      typeof v === 'string' ? v.toLocaleLowerCase('uk') : v
    )
    this._sqlite = sqlite
    this._orm = drizzle({ client: sqlite, schema, casing: 'snake_case' })
    const pending = existsSync(this.file) ? this.pendingMigrations(sqlite) : 0
    this.backupBeforeMigrate(sqlite, pending)
    migrate(this._orm, { migrationsFolder: this.migrationsDir })
    this.migratedOnOpen = pending
  }

  close(): void {
    if (!this._sqlite) return
    try {
      this._sqlite.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      /* ignore */
    }
    this._sqlite.close()
    this._sqlite = null
    this._orm = null
  }

  get orm(): Orm {
    if (!this._orm) throw new Error('Database is not open')
    return this._orm
  }

  get sqlite(): Database.Database {
    if (!this._sqlite) throw new Error('Database is not open')
    return this._sqlite
  }

  /** Runs fn inside a synchronous transaction. */
  tx<T>(fn: () => T): T {
    return this.sqlite.transaction(fn)()
  }

  /** Consistent online copy of the database. */
  async backupTo(file: string): Promise<void> {
    await this.sqlite.backup(file)
  }
}
