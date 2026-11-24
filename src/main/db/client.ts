import Database from 'better-sqlite3'
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
    private readonly migrationsDir: string
  ) {}

  open(): void {
    const sqlite = new Database(this.file)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('busy_timeout = 5000')
    this._sqlite = sqlite
    this._orm = drizzle({ client: sqlite, schema, casing: 'snake_case' })
    migrate(this._orm, { migrationsFolder: this.migrationsDir })
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
