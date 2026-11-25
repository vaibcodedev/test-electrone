/**
 * A real Vault backend for unit tests: DbContext on a fresh database in a temp folder, the cross-cutting
 * services and the modules that need each other (boards, crm, calendar, jobs) — wired like container.ts.
 * Electron is not available under plain Node: test files mock 'electron' and the logger before importing this.
 */
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { DbContext } from '@main/db/client'
import { EntityRegistry } from '@main/core/registry'
import { EventBus } from '@main/core/event-bus'
import { SearchIndex } from '@main/services/search-index'
import { TagService } from '@main/services/tag-service'
import { LinkService } from '@main/services/link-service'
import { PinService } from '@main/services/pin-service'
import { FileStorage } from '@main/services/file-storage'
import { AttachmentService } from '@main/services/attachment-service'
import { SecretBox } from '@main/services/secret-box'
import { TrashService } from '@main/services/trash-service'
import { RevisionService } from '@main/services/revision-service'
import { ImportService } from '@main/services/import-service'
import { BoardsModule } from '@main/modules/boards'
import { CrmModule } from '@main/modules/crm'
import { CalendarModule } from '@main/modules/calendar'
import { JobsModule } from '@main/modules/jobs'
import { MediaModule } from '@main/modules/media'
import { EnglishModule } from '@main/modules/english'
import { FreelanceModule } from '@main/modules/freelance'
import { ChecklistsModule } from '@main/modules/checklists'
import type { ModuleContext } from '@main/modules/context'
import type { Api as ApiContract } from '@shared/api'

type Api = Pick<
  ApiContract,
  | 'boards'
  | 'cards'
  | 'projects'
  | 'time'
  | 'events'
  | 'jobs'
  | 'components'
  | 'english'
  | 'platforms'
  | 'proposals'
  | 'clients'
  | 'templates'
  | 'checklists'
>

export class Vault {
  readonly dir = mkdtempSync(join(tmpdir(), 'vault-unit-'))
  readonly db = new DbContext(join(this.dir, 'vault.db'), resolve('src/main/db/migrations'))
  readonly registry = new EntityRegistry(this.db)
  readonly search = new SearchIndex(this.db, this.registry)
  readonly tags = new TagService(this.db, this.registry)
  readonly links = new LinkService(this.db, this.registry)
  readonly files = new FileStorage(join(this.dir, 'files'))
  readonly trash: TrashService
  readonly revisions: RevisionService
  readonly importer = new ImportService(this.db)
  readonly boards: BoardsModule
  readonly crm: CrmModule
  readonly calendar: CalendarModule
  readonly jobs: JobsModule
  readonly media: MediaModule
  readonly api: Api
  /** What modules get from container.ts: a test can build one more module on the same database. */
  readonly m: ModuleContext

  constructor() {
    this.db.open()
    const pins = new PinService(this.db, this.registry)
    const attachments = new AttachmentService(this.db, this.files, this.registry)
    const m: ModuleContext = (this.m = {
      db: this.db,
      registry: this.registry,
      repo: { ctx: this.db, tags: this.tags, search: this.search },
      links: this.links,
      files: this.files,
      attachments,
      bus: new EventBus(),
      secrets: new SecretBox()
    })
    this.boards = new BoardsModule(m)
    this.crm = new CrmModule(m)
    this.calendar = new CalendarModule(m)
    this.jobs = new JobsModule(m, this.calendar)
    this.media = new MediaModule(m)
    const english = new EnglishModule(m)
    const freelance = new FreelanceModule(m, this.crm)
    const checklists = new ChecklistsModule(m)
    for (const d of [
      ...this.boards.descriptors,
      ...this.crm.descriptors,
      this.calendar.descriptor,
      ...this.jobs.descriptors,
      ...this.media.descriptors,
      english.descriptor,
      ...freelance.descriptors,
      checklists.descriptor
    ]) {
      this.registry.register(d)
    }
    const { tags, links, search, files } = this
    this.trash = new TrashService(this.db, this.registry, { tags, links, pins, attachments, search, files })
    this.revisions = new RevisionService(this.db, this.registry, tags, search, files)
    this.api = {
      boards: this.boards.boardsApi(),
      cards: this.boards.cardsApi(),
      projects: this.crm.projectsApi(),
      time: this.crm.timeApi(),
      events: this.calendar.api(),
      jobs: this.jobs.api(),
      components: this.media.componentsApi(),
      english: english.api(),
      platforms: freelance.platformsApi(),
      proposals: freelance.proposalsApi(),
      clients: this.crm.clientsApi(),
      templates: freelance.templatesApi(),
      checklists: checklists.api()
    }
  }

  close(): void {
    this.db.close()
    rmSync(this.dir, { recursive: true, force: true })
  }
}

export function openVault(): Vault {
  return new Vault()
}
