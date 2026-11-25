import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

/**
 * All on-disk locations. Data lives in one folder so it can be copied/backed up as a whole:
 *   <userData>/data/vault.db      — SQLite database
 *   <userData>/data/files/…       — images & attachments (DB stores relative paths only)
 *   <userData>/data/backups/…     — automatic daily backups
 */
export class AppPaths {
  readonly dataDir: string
  readonly dbFile: string
  readonly filesDir: string
  readonly backupsDir: string
  readonly configFile: string
  /** «Чат ШІ» history: next to config.json, outside the database (never in backups or exports). */
  readonly aiChatsFile: string
  readonly tmpDir: string

  constructor(root = join(app.getPath('userData'), 'data')) {
    this.dataDir = root
    this.dbFile = join(root, 'vault.db')
    this.filesDir = join(root, 'files')
    this.backupsDir = join(root, 'backups')
    this.tmpDir = join(root, '.tmp')
    this.configFile = join(app.getPath('userData'), 'config.json')
    this.aiChatsFile = join(app.getPath('userData'), 'ai-chats.json')
    for (const dir of [this.dataDir, this.filesDir, this.backupsDir, this.tmpDir]) {
      mkdirSync(dir, { recursive: true })
    }
  }

  get migrationsDir(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'migrations')
      : join(app.getAppPath(), 'src/main/db/migrations')
  }

  get rendererDir(): string {
    return join(__dirname, '../renderer')
  }
}
