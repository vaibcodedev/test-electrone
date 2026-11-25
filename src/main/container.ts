/**
 * Composition root: builds every service once and wires them by constructor injection.
 * No module reaches for globals — swapping an implementation means changing only this file.
 */
import { app } from 'electron'
import { log } from './core/logger'
import { openPathOrThrow } from './core/open-path'
import type { Api } from '@shared/api'
import { AppPaths } from './core/paths'
import { ConfigStore } from './core/config-store'
import { EventBus } from './core/event-bus'
import { EntityRegistry } from './core/registry'
import { DbContext } from './db/client'
import { SearchIndex } from './services/search-index'
import { createEach, ImportService } from './services/import-service'
import { TagService } from './services/tag-service'
import { LinkService } from './services/link-service'
import { PinService } from './services/pin-service'
import { FileStorage } from './services/file-storage'
import { AttachmentService } from './services/attachment-service'
import { RevisionService } from './services/revision-service'
import { TrashService } from './services/trash-service'
import { SecretBox } from './services/secret-box'
import { BackupService } from './services/backup-service'
import { ExportService } from './services/export-service'
import { DashboardService } from './services/dashboard-service'
import { QuickAddService } from './services/quick-add-service'
import { ReminderService } from './services/reminder-service'
import { BoardsModule } from './modules/boards'
import { IdeasModule } from './modules/ideas'
import { KnowledgeModule } from './modules/knowledge'
import { MediaModule } from './modules/media'
import { CrmModule } from './modules/crm'
import { ChecklistsModule } from './modules/checklists'
import { EnglishModule } from './modules/english'
import { CalendarModule } from './modules/calendar'
import { FreelanceModule } from './modules/freelance'
import { FinanceModule } from './modules/finance'
import { JobsModule, STAGE_DEADLINE_SOURCE, STAGE_SOURCE } from './modules/jobs'
import { DevProjectsModule } from './modules/dev-projects'
import { GithubService } from './services/github-service'
import { GitClient } from './services/git-client'
import { ScriptRunner } from './system/script-runner'
import { WeeklyReviewService } from './services/weekly-review-service'
import { CaptureServer } from './services/capture-server'
import { FEED_COLOR, type CalendarItem } from '@shared/domain/calendar'
import type { ModuleContext } from './modules/context'
import { WindowManager } from './system/window-manager'
import { TrayController } from './system/tray'
import { ShortcutController } from './system/shortcuts'
import { Updater } from './system/updater'
import { applyAutostart } from './system/autostart'
import { AppApiFactory } from './system/app-api'

export class Container {
  readonly paths = new AppPaths()
  readonly config = new ConfigStore(this.paths.configFile)
  readonly bus = new EventBus()
  readonly db = new DbContext(this.paths.dbFile, this.paths.migrationsDir, this.paths.backupsDir, app.getVersion())
  readonly registry = new EntityRegistry(this.db)
  readonly search = new SearchIndex(this.db, this.registry)
  readonly tags = new TagService(this.db, this.registry)
  readonly links = new LinkService(this.db, this.registry)
  readonly pins = new PinService(this.db, this.registry)
  readonly files = new FileStorage(this.paths.filesDir)
  readonly attachments = new AttachmentService(this.db, this.files, this.registry)
  readonly secrets = new SecretBox()
  readonly revisions = new RevisionService(this.db, this.registry, this.tags, this.search, this.files)
  readonly trash = new TrashService(this.db, this.registry, {
    tags: this.tags,
    links: this.links,
    pins: this.pins,
    attachments: this.attachments,
    search: this.search,
    files: this.files
  })

  private readonly moduleCtx: ModuleContext = {
    db: this.db,
    registry: this.registry,
    repo: { ctx: this.db, tags: this.tags, search: this.search },
    links: this.links,
    files: this.files,
    attachments: this.attachments,
    bus: this.bus,
    secrets: this.secrets
  }

  readonly boards = new BoardsModule(this.moduleCtx)
  readonly ideas = new IdeasModule(this.moduleCtx, this.boards)
  readonly knowledge = new KnowledgeModule(this.moduleCtx)
  readonly media = new MediaModule(this.moduleCtx)
  readonly crm = new CrmModule(this.moduleCtx)
  readonly checklists = new ChecklistsModule(this.moduleCtx)
  readonly english = new EnglishModule(this.moduleCtx)
  readonly calendar = new CalendarModule(this.moduleCtx)
  readonly freelance = new FreelanceModule(this.moduleCtx, this.crm)
  readonly finance = new FinanceModule(this.moduleCtx, this.freelance)
  readonly jobs = new JobsModule(this.moduleCtx, this.calendar)
  readonly git = new GitClient()
  readonly scripts = new ScriptRunner(this.bus)
  readonly devProjects = new DevProjectsModule(this.moduleCtx, this.git, this.scripts)
  readonly github = new GithubService(this.config, this.secrets)
  readonly review = new WeeklyReviewService(this.db, {
    finance: this.finance,
    calendar: this.calendar,
    boards: this.boards,
    jobs: this.jobs,
    freelance: this.freelance,
    dev: this.devProjects,
    git: this.git
  })

  readonly backup = new BackupService(this.db, this.paths, this.config, this.search, this.bus)
  readonly exporter = new ExportService(this.db, this.paths, this.registry, this.tags, this.links)
  readonly dashboard = new DashboardService(this.db, this.registry, this.pins, {
    boards: this.boards,
    calendar: this.calendar,
    crm: this.crm,
    english: this.english,
    ideas: this.ideas,
    knowledge: this.knowledge,
    checklists: this.checklists
  })

  readonly windows: WindowManager
  readonly tray: TrayController
  readonly shortcuts: ShortcutController
  readonly updater: Updater
  readonly reminders: ReminderService
  readonly capture: CaptureServer
  readonly api: Api

  constructor(readonly iconPath: string) {
    for (const d of [
      ...this.boards.descriptors,
      this.ideas.descriptor,
      ...this.knowledge.descriptors,
      ...this.media.descriptors,
      ...this.crm.descriptors,
      this.checklists.descriptor,
      this.english.descriptor,
      this.calendar.descriptor,
      ...this.freelance.descriptors,
      ...this.jobs.descriptors
    ]) {
      this.registry.register(d)
    }

    this.windows = new WindowManager(this.config, this.bus, iconPath)
    const time = this.crm.timeApi()
    this.tray = new TrayController(
      this.windows,
      this.config,
      iconPath,
      (enabled) => this.config.updateSettings({ launchAtLogin: enabled }),
      {
        running: () => this.crm.running(),
        projects: () => this.crm.recentActiveProjects(),
        start: (projectId) => time.start({ projectId }),
        stop: () => time.stop(),
        onChange: (cb) => this.bus.onDataChanged(cb)
      }
    )
    this.shortcuts = new ShortcutController(this.config, this.windows)
    this.updater = new Updater(this.bus, this.config)
    this.reminders = new ReminderService(
      this.db,
      this.calendar,
      this.boards,
      (route) => this.windows.showMain(route),
      iconPath,
      this.jobs,
      this.config
    )
    this.api = this.buildApi()
    this.capture = new CaptureServer(this.config, () => this.api, this.bus, (route) => this.windows.showMain(route), iconPath)
    this.config.onSettingsChange((s) => {
      applyAutostart(s.launchAtLogin)
      this.bus.emit('settings:changed', s)
    })
  }

  private dbOpen = false

  /** Opens the database (runs pending migrations, a safety copy is made before them). */
  openDb(): void {
    this.db.open()
    this.dbOpen = true
  }

  /** Housekeeping after the database is open (opens it first when the caller didn't). */
  init(): void {
    if (!this.dbOpen) this.openDb()
    if (this.search.count() === 0) this.search.rebuild()
    this.checklists.seedIfEmpty(this.config)
    this.freelance.seedIfEmpty(this.config)
    this.jobs.seedIfEmpty(this.config)
    this.jobs.tidy()
    this.registerCalendarFeeds()
    this.trash.purgeExpired()
    this.trash.purgeStaleDrafts()
    setInterval(() => {
      try {
        this.trash.purgeExpired()
      } catch (e) {
        log.error('[trash] purge failed', e)
      }
    }, 6 * 3600_000)
  }

  /** One calendar for everything: each module adds its dated items; interview events open the vacancy. */
  private registerCalendarFeeds(): void {
    for (const m of [this.boards, this.crm, this.finance, this.jobs]) {
      this.calendar.addFeedProvider((from, to) => m.calendarFeed(from, to))
    }
    const stageRoute = (e: { sourceId: string | null }): Partial<CalendarItem> | null => {
      const appId = e.sourceId ? this.jobs.applicationOfStage(e.sourceId) : null
      // The colour too: older stage events keep the one saved when they were created.
      return appId ? { source: 'interview', ref: { type: 'application', id: appId }, color: FEED_COLOR.interview } : null
    }
    this.calendar.decorateSource(STAGE_SOURCE, stageRoute)
    this.calendar.decorateSource(STAGE_DEADLINE_SOURCE, stageRoute)
  }

  private buildApi(): Api {
    const modulesApi = {
      ideas: this.ideas.api(),
      boards: this.boards.boardsApi(),
      cards: this.boards.cardsApi(),
      claude: this.knowledge.claudeApi(),
      libraries: this.knowledge.librariesApi(),
      components: this.media.componentsApi(),
      designs: this.media.designsApi(),
      moodboards: this.media.moodboardsApi(),
      snippets: this.knowledge.snippetsApi(),
      clients: this.crm.clientsApi(),
      projects: this.crm.projectsApi(),
      credentials: this.crm.credentialsApi(),
      time: this.crm.timeApi(),
      payments: this.crm.paymentsApi(),
      checklists: this.checklists.api(),
      fixes: this.knowledge.fixesApi(),
      bookmarks: this.knowledge.bookmarksApi(),
      knowledge: this.knowledge.knowledgeApi(),
      english: this.english.api(),
      events: this.calendar.api(),
      notes: this.knowledge.notesApi(),
      platforms: this.freelance.platformsApi(),
      proposals: this.freelance.proposalsApi(),
      credits: this.freelance.creditsApi(),
      templates: this.freelance.templatesApi(),
      cases: this.freelance.casesApi(),
      redflags: this.freelance.redFlagsApi(),
      goals: this.freelance.goalsApi(),
      freelance: this.freelance.freelanceApi(),
      finance: this.finance.api(),
      jobs: this.jobs.api(),
      devProjects: this.devProjects.api(),
      github: this.github.api(() => this.devProjects.repoIndex()),
      review: this.review.api(),
      capture: {
        info: async () => this.capture.info(),
        regenerateKey: async () => {
          this.capture.regenerate()
          return this.capture.info()
        },
        openExtensionDir: () => openPathOrThrow(this.capture.extensionDir, 'Папку розширення не знайдено — перевстановіть Vault')
      }
    }
    const quickAdd = new QuickAddService(modulesApi, this.db)

    // JSON import: each module registers how to create its records (ImportService has no per-kind code).
    const importer = new ImportService(this.db)
    importer.register('checklist', async (data) => {
      const c = await modulesApi.checklists.importTemplate(data)
      return { created: 1, firstId: c.id }
    })
    importer.register('question', createEach(modulesApi.jobs.createQuestion))
    importer.register('word', createEach(modulesApi.english.create))
    importer.register('snippet', createEach(modulesApi.snippets.create))
    importer.register('template', createEach(modulesApi.templates.create))
    importer.register('redflag', createEach(modulesApi.redflags.create))
    importer.register('idea', createEach(modulesApi.ideas.create))
    importer.register('bookmark', createEach(modulesApi.bookmarks.create))
    importer.register('library', createEach(modulesApi.libraries.create))
    const appApi = new AppApiFactory({
      paths: this.paths,
      config: this.config,
      shortcuts: this.shortcuts,
      updater: this.updater,
      windows: this.windows,
      dashboard: this.dashboard,
      quickAdd
    })

    return {
      ...modulesApi,
      importer: { run: async (args) => importer.run(args) },
      tags: this.tags.api(),
      links: this.links.api(),
      pins: this.pins.api(),
      search: this.search.api((limit) => this.dashboard.recent(limit)),
      records: this.revisions.api(this.bus),
      trash: this.trash.api(this.bus),
      files: this.attachments.api(),
      backup: this.backup.api(this.exporter),
      settings: appApi.settings(),
      updates: appApi.updates(),
      app: appApi.app()
    }
  }
}
