/**
 * Composition root: builds every service once and wires them by constructor injection.
 * No module reaches for globals — swapping an implementation means changing only this file.
 */
import { app, BrowserWindow, clipboard, dialog, net, session } from 'electron'
import { dirname, join } from 'path'
import { log, logFilePath } from './core/logger'
import { openPathOrThrow } from './core/open-path'
import type { Api, CaptureApi } from '@shared/api'
import { pairAnswerSchema } from '@shared/domain/dev'
import { AppPaths } from './core/paths'
import { ConfigStore } from './core/config-store'
import { EventBus } from './core/event-bus'
import { EntityRegistry } from './core/registry'
import { DbContext } from './db/client'
import { SearchIndex } from './services/search-index'
import { createEach, ImportService } from './services/import-service'
import { TagService } from './services/tag-service'
import { LinkService } from './services/link-service'
import { MentionService } from './services/mention-service'
import { PinService } from './services/pin-service'
import { FileStorage } from './services/file-storage'
import { AttachmentService } from './services/attachment-service'
import { RevisionService } from './services/revision-service'
import { TrashService } from './services/trash-service'
import { SecretBox } from './services/secret-box'
import { SecretClipboard } from './services/secret-clipboard'
import { BackupService } from './services/backup-service'
import { StorageService } from './services/storage-service'
import { storageLayout } from './services/storage-usage'
import { ExportService } from './services/export-service'
import { CalendarExportService } from './services/calendar-export'
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
import { AiService } from './services/ai'
import { AiHttp } from './services/ai/adapter'
import { AnthropicAdapter } from './services/ai/anthropic'
import { OpenAiAdapter } from './services/ai/openai'
import { ChatStore } from './services/ai/chat-store'
import { AiChatService } from './services/ai/chat'
import { AiActionRunner, type AiActionApi as AiActionRunnerApi } from './services/ai/actions'
import { RegistryRecordWriter } from './services/ai/record-writer'
import { GitClient } from './services/git-client'
import { ScriptRunner } from './system/script-runner'
import { WeeklyReviewService } from './services/weekly-review-service'
import { bundledExtensionDir, CaptureServer } from './services/capture-server'
import { ExtensionFolder } from './services/extension-folder'
import { openChromeExtensions } from './system/browser-launcher'
import { FEED_COLOR, type CalendarItem } from '@shared/domain/calendar'
import type { ModuleContext } from './modules/context'
import { WindowManager } from './system/window-manager'
import { TextMenuController } from './system/text-menu'
import { TrayController } from './system/tray'
import { ShortcutController } from './system/shortcuts'
import { Updater } from './system/updater'
import { applyAutostart } from './system/autostart'
import { AppApiFactory } from './system/app-api'
import { SandboxService } from './system/sandbox-service'
import { DemoSeedService } from './services/demo-seed'
import type { Profile } from './core/profile'

export class Container {
  readonly paths = new AppPaths()
  readonly config = new ConfigStore(this.paths.configFile)
  readonly bus = new EventBus()
  readonly db = new DbContext(
    this.paths.dbFile,
    this.paths.migrationsDir,
    this.paths.backupsDir,
    app.getVersion()
  )
  readonly registry = new EntityRegistry(this.db)
  readonly search = new SearchIndex(this.db, this.registry)
  readonly tags = new TagService(this.db, this.registry)
  readonly links = new LinkService(this.db, this.registry)
  readonly mentions = new MentionService(this.db, this.registry)
  readonly pins = new PinService(this.db, this.registry)
  readonly files = new FileStorage(this.paths.filesDir)
  readonly attachments = new AttachmentService(this.db, this.files, this.registry)
  readonly secrets = new SecretBox()
  readonly revisions = new RevisionService(
    this.db,
    this.registry,
    this.tags,
    this.search,
    this.files
  )
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
  readonly crm = new CrmModule(this.moduleCtx, new SecretClipboard(clipboard))
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
  readonly ai = this.createAi()
  readonly aiChats = new ChatStore(this.paths.aiChatsFile)
  readonly review = new WeeklyReviewService(this.db, {
    finance: this.finance,
    calendar: this.calendar,
    boards: this.boards,
    jobs: this.jobs,
    freelance: this.freelance,
    dev: this.devProjects,
    git: this.git
  })

  /** Built in the constructor: it needs the profile (no copies to an outside folder from the sandbox). */
  readonly backup: BackupService
  readonly storage: StorageService
  readonly exporter = new ExportService(this.db, this.paths, this.registry, this.tags, this.links)
  readonly calendarExport = new CalendarExportService(this.calendar, async (name) => {
    const res = await dialog.showSaveDialog(
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0],
      {
        title: 'Експорт календаря',
        defaultPath: join(app.getPath('documents'), name),
        filters: [{ name: 'Календар iCalendar', extensions: ['ics'] }]
      }
    )
    return res.canceled || !res.filePath ? null : res.filePath
  })
  readonly dashboard = new DashboardService(this.db, this.registry, this.pins, {
    boards: this.boards,
    calendar: this.calendar,
    crm: this.crm,
    english: this.english,
    ideas: this.ideas,
    knowledge: this.knowledge,
    checklists: this.checklists
  })

  readonly textMenu = new TextMenuController()
  readonly windows: WindowManager
  readonly tray: TrayController
  readonly shortcuts: ShortcutController
  readonly updater: Updater
  readonly reminders: ReminderService
  readonly capture: CaptureServer
  readonly extensionFolder: ExtensionFolder
  readonly sandbox: SandboxService
  readonly api: Api
  private disposed = false

  /** `profile`: «Тестовий режим» or the real data; index.ts has already pointed userData at its folder. */
  constructor(
    readonly iconPath: string,
    readonly profile: Profile
  ) {
    this.backup = new BackupService(this.db, this.paths, this.config, this.search, this.bus, {
      folderCopies: profile.kind === 'main'
    })
    this.storage = new StorageService({
      layout: storageLayout(this.paths, {
        userData: app.getPath('userData'),
        sessionData: app.getPath('sessionData'),
        logsDir: dirname(logFilePath())
      }),
      currentLog: logFilePath,
      installDir: app.isPackaged ? dirname(app.getPath('exe')) : null,
      session: () => session.defaultSession,
      backups: this.backup
    })
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

    this.windows = new WindowManager(this.config, this.bus, iconPath, profile.kind, this.textMenu)
    const time = this.crm.timeApi()
    this.tray = new TrayController(
      this.windows,
      this.config,
      iconPath,
      (enabled) => this.config.updateSettings({ launchAtLogin: enabled }),
      profile.kind,
      {
        running: () => this.crm.running(),
        projects: () => this.crm.recentActiveProjects(),
        start: (projectId) => time.start({ projectId }),
        stop: () => time.stop(),
        onChange: (cb) => this.bus.onDataChanged(cb)
      }
    )
    this.shortcuts = new ShortcutController(this.config, this.windows)
    this.updater = new Updater(this.bus, this.config, profile.kind)
    this.reminders = new ReminderService(
      this.db,
      this.calendar,
      this.boards,
      (route) => this.windows.showMain(route),
      iconPath,
      this.jobs,
      this.config
    )
    this.sandbox = new SandboxService({
      profile,
      ledger: this.config,
      backup: this.backup,
      scripts: this.scripts,
      updater: this.updater,
      bus: this.bus,
      dispose: () => this.dispose(),
      demo: new DemoSeedService(() => this.api, this.config, this.bus, iconPath)
    })
    // The folder Chrome loads lives in the REAL profile; the test profile only reads it.
    this.extensionFolder = new ExtensionFolder({
      bundledDir: bundledExtensionDir(),
      stableDir: join(profile.mainUserData, 'extension'),
      canWrite: profile.kind === 'main'
    })
    this.api = this.buildApi()
    this.capture = new CaptureServer(
      this.config,
      () => this.api,
      this.bus,
      (route) => this.windows.showMain(route),
      iconPath,
      { folder: this.extensionFolder }
    )
    // «Під’єднати до Vault» in the extension: the window comes up with the question; the dialog follows changes.
    this.capture.onPairChange((pending) => {
      if (pending) this.windows.showMain()
      this.bus.emit('capture:pair', pending)
    })
    this.config.onSettingsChange((s) => {
      applyAutostart(s.launchAtLogin, profile.kind)
      this.bus.emit('settings:changed', s)
    })
  }

  /**
   * Stops everything and closes the database: on quit (will-quit) and before a «Тестовий режим» relaunch,
   * where app.exit() skips will-quit. Idempotent; each step on its own, so one failure (EPERM on
   * config.json) never leaves the database open or stops the relaunch.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const step = (name: string, fn: () => void): void => {
      try {
        fn()
      } catch (e) {
        log.error('[dispose]', name, e)
      }
    }
    step('reminders', () => this.reminders.stop())
    step('scripts', () => this.scripts.killAll())
    step('capture', () => this.capture.stop())
    step('backup', () => this.backup.stop())
    step('updater', () => this.updater.stop())
    step('tray', () => this.tray.destroy())
    step('config', () => this.config.flush())
    step('ai chats', () => this.aiChats.flush())
    step('db', () => this.db.close())
  }

  /** AI on the person's key: two wire formats over net.fetch, records read through the registry. */
  private createAi(): AiService {
    const http = new AiHttp((url, init) => net.fetch(url, init))
    return new AiService({
      store: this.config,
      secrets: this.secrets,
      adapters: { anthropic: new AnthropicAdapter(http), openai: new OpenAiAdapter(http) },
      records: {
        text: (ref) => {
          const row = this.registry.findRow(ref)
          if (!row) return null
          // The record's own text only: searchDoc's indexOnly (credential hosts) never goes to a provider.
          const { title, body } = this.registry.get(ref.type).searchDoc(row)
          return { title, body }
        },
        tagsOf: (ref) => this.tags.forMany(ref.type, [ref.id]).get(ref.id) ?? [],
        allTags: () => this.tags.list()
      }
    })
  }

  /**
   * «Чат ШІ»: reads the base through the registry and the search index (live records only), creates records
   * through the module APIs, edits through the registry; every window hears about a change.
   */
  private createAiChat(api: AiActionRunnerApi): AiChatService {
    const liveBoards = (): { id: string; title: string }[] =>
      this.boards
        .listBoards({ limit: 50 })
        .filter((b) => !b.archived)
        .map((b) => ({ id: b.id, title: b.title }))
    return new AiChatService({
      ai: this.ai,
      history: this.aiChats,
      base: {
        record: (ref) => {
          const row = this.registry.findRow(ref)
          if (!row) return null
          const doc = this.registry.get(ref.type).searchDoc(row)
          return { ref: { type: ref.type, id: ref.id }, title: doc.title, body: doc.body }
        },
        search: (words, { any, limit }) => {
          const hits = this.search.query({ text: words.join(' '), limit: limit * 2 }, { any })
          return this.registry
            .summarize(hits)
            .slice(0, limit)
            .map((s) => ({ type: s.type, id: s.id }))
        },
        boards: () => liveBoards().map((b) => b.title)
      },
      actions: new AiActionRunner({
        api,
        boards: { list: liveBoards, columns: (id) => this.boards.columns(id) },
        records: new RegistryRecordWriter({
          ctx: this.db,
          registry: this.registry,
          tags: this.tags,
          search: this.search,
          revisions: this.revisions,
          trash: this.trash
        })
      }),
      changed: (type) => this.bus.dataChanged([type])
    })
  }

  /** Opens the database (runs pending migrations, a safety copy is made before them). */
  openDb(): void {
    this.db.open()
  }

  /**
   * Housekeeping once the database is open (index.ts calls openDb() first). Each step on its own: a bad
   * record failing one of them every start is logged, and Vault still opens — the data is intact.
   */
  init(): void {
    const housekeep = (name: string, fn: () => void): void => {
      try {
        fn()
      } catch (e) {
        log.error('[startup]', name, e)
      }
    }
    housekeep('search index', () => {
      if (this.search.count() === 0) this.search.rebuild()
      // After an update: accesses joined the text of their client / project (names, hosts — never secrets).
      else if (this.db.migratedOnOpen) this.crm.reindexCredentialOwners()
    })
    housekeep('checklist seeds', () => this.checklists.seedIfEmpty(this.config))
    housekeep('freelance seeds', () => this.freelance.seedIfEmpty(this.config))
    housekeep('job seeds', () => this.jobs.seedIfEmpty(this.config))
    housekeep('job tidy', () => this.jobs.tidy())
    housekeep('design file sizes', () => this.media.backfillImageBytes())
    this.registerCalendarFeeds()
    housekeep('trash purge', () => this.trash.purgeExpired())
    housekeep('stale drafts', () => this.trash.purgeStaleDrafts())
    // A newer bundled extension goes to the folder Chrome loads (async; logs and never throws).
    void this.extensionFolder.sync()
    setInterval(() => housekeep('trash purge', () => this.trash.purgeExpired()), 6 * 3600_000)
  }

  /** One calendar for everything: each module adds its dated items; interview events open the vacancy. */
  private registerCalendarFeeds(): void {
    for (const m of [this.boards, this.crm, this.finance, this.jobs]) {
      this.calendar.addFeedProvider((from, to) => m.calendarFeed(from, to))
    }
    const stageRoute = (e: { sourceId: string | null }): Partial<CalendarItem> | null => {
      const appId = e.sourceId ? this.jobs.applicationOfStage(e.sourceId) : null
      // The colour too: older stage events keep the one saved when they were created.
      return appId
        ? {
            source: 'interview',
            ref: { type: 'application', id: appId },
            color: FEED_COLOR.interview
          }
        : null
    }
    this.calendar.decorateSource(STAGE_SOURCE, stageRoute)
    this.calendar.decorateSource(STAGE_DEADLINE_SOURCE, stageRoute)
  }

  /** Settings → «Розширення для Chrome»: key, pairing answers, the extension folder. */
  private captureApi(): CaptureApi {
    return {
      info: async () => this.capture.info(),
      regenerateKey: async () => {
        this.capture.regenerate()
        return this.capture.info()
      },
      openExtensionDir: async () => {
        await this.extensionFolder.sync()
        await openPathOrThrow(
          this.capture.extensionDir,
          'Папку розширення не знайдено — перевстановіть Vault'
        )
      },
      installExtension: async () => {
        await this.extensionFolder.sync()
        const dir = this.capture.extensionDir
        // Electron 44: the W3C-style async clipboard.
        await clipboard.writeText(dir)
        return { dir, browserOpened: await openChromeExtensions() }
      },
      pairRequest: async () => this.capture.pendingPair(),
      answerPair: async (input) => this.capture.answerPair(pairAnswerSchema.parse(input))
    }
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
      events: { ...this.calendar.api(), ...this.calendarExport.api() },
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
      ai: this.ai.api(),
      review: this.review.api(),
      capture: this.captureApi()
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
      aiChat: this.createAiChat(modulesApi).api(),
      importer: { run: async (args) => importer.run(args) },
      tags: this.tags.api(),
      links: this.links.api(),
      mentions: this.mentions.api(),
      pins: this.pins.api(),
      search: this.search.api((limit, types) => this.dashboard.recent(limit, types)),
      records: this.revisions.api(this.bus),
      trash: this.trash.api(this.bus),
      files: this.attachments.api(),
      backup: this.backup.api(this.exporter),
      storage: this.storage.api(),
      settings: appApi.settings(),
      updates: appApi.updates(),
      app: appApi.app(),
      textMenu: this.textMenu.api(),
      sandbox: this.sandbox.api()
    }
  }
}
