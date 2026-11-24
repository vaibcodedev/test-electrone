/**
 * Composition root: builds every service once and wires them by constructor injection.
 * No module reaches for globals — swapping an implementation means changing only this file.
 */
import { app, clipboard, shell } from 'electron'
import { dirname } from 'path'
import { log, logFilePath } from './core/logger'
import { statSync } from 'fs'
import { z } from 'zod'
import type { Api } from '@shared/api'
import { entityRefSchema } from '@shared/domain/common'
import { EXPORT_FORMATS, PIN_KINDS, searchQuerySchema, settingsPatchSchema } from '@shared/domain/system'
import { fileSourceSchema } from '@shared/domain/designs'
import { AppPaths } from './core/paths'
import { ConfigStore } from './core/config-store'
import { EventBus } from './core/event-bus'
import { EntityRegistry } from './core/registry'
import { DbContext } from './db/client'
import { SearchIndex } from './services/search-index'
import { TagService } from './services/tag-service'
import { LinkService } from './services/link-service'
import { PinService } from './services/pin-service'
import { FileStorage } from './services/file-storage'
import { AttachmentService } from './services/attachment-service'
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
import { JobsModule } from './modules/jobs'
import { DevProjectsModule } from './modules/dev-projects'
import { GithubService } from './services/github-service'
import { WeeklyReviewService } from './services/weekly-review-service'
import { CaptureServer } from './services/capture-server'
import { githubTokenSchema } from '@shared/domain/dev'
import { reviewNotesSchema } from '@shared/domain/review'
import type { CalendarItem } from '@shared/domain/calendar'
import { idArg, type ModuleContext } from './modules/context'
import { WindowManager } from './system/window-manager'
import { TrayController } from './system/tray'
import { ShortcutController } from './system/shortcuts'
import { Updater } from './system/updater'
import { applyAutostart } from './system/autostart'

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
  readonly attachments = new AttachmentService(this.db, this.files)
  readonly secrets = new SecretBox()
  readonly trash = new TrashService(this.db, this.registry, {
    tags: this.tags,
    links: this.links,
    pins: this.pins,
    attachments: this.attachments,
    search: this.search
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
  readonly calendar = new CalendarModule(this.moduleCtx, this.boards, this.crm)
  readonly freelance = new FreelanceModule(this.moduleCtx, this.crm)
  readonly finance = new FinanceModule(this.moduleCtx, this.freelance)
  readonly jobs = new JobsModule(this.moduleCtx, this.calendar)
  readonly devProjects = new DevProjectsModule(this.moduleCtx)
  readonly github = new GithubService(this.config, this.secrets)
  readonly review = new WeeklyReviewService(this.db, {
    finance: this.finance,
    calendar: this.calendar,
    boards: this.boards,
    jobs: this.jobs,
    freelance: this.freelance,
    dev: this.devProjects
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
    this.tray = new TrayController(this.windows, this.config, iconPath, (enabled) =>
      this.config.updateSettings({ launchAtLogin: enabled })
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

  /** Opens the DB and performs housekeeping. */
  init(): void {
    this.db.open()
    if (this.search.count() === 0) this.search.rebuild()
    this.checklists.seedIfEmpty()
    this.freelance.seedIfEmpty()
    this.jobs.seedIfEmpty()
    this.registerCalendarFeeds()
    this.trash.purgeExpired()
    setInterval(() => this.trash.purgeExpired(), 6 * 3600_000)
  }

  /** One calendar for everything: subscriptions, interviews (→ vacancy), application follow-ups. */
  private registerCalendarFeeds(): void {
    const financeApi = this.finance
    this.calendar.addFeedProvider((from, to) => {
      const items: CalendarItem[] = []
      const start = new Date(from)
      for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d.getTime() <= to; d.setMonth(d.getMonth() + 1)) {
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        for (const s of financeApi.subscriptionMonth(month)) {
          if (s.dueAt < from || s.dueAt > to) continue
          items.push({
            key: `subscription:${s.id}:${month}`,
            source: 'subscription' as const,
            ref: { type: 'event' as const, id: s.id },
            route: `/finance/expenses?month=${month}`,
            title: `Подписка: ${s.title} · ${s.amount} ${s.currency}`,
            startAt: s.dueAt,
            endAt: null,
            allDay: true,
            color: '#c98af0',
            done: !!s.expenseId
          })
        }
      }
      return items
    })
    this.calendar.addFeedProvider((from, to) =>
      this.jobs.appRepo
        .listWhere([])
        .filter((a) => a.followUpAt && a.followUpAt >= from && a.followUpAt <= to && !a.closedAt)
        .map((a) => ({
          key: `followup:${a.id}`,
          source: 'followup' as const,
          ref: { type: 'application' as const, id: a.id },
          title: `Напомнить о себе: ${a.title}${a.companyName ? ` — ${a.companyName}` : ''}`,
          startAt: a.followUpAt!,
          endAt: null,
          allDay: true,
          color: '#3fbf9b',
          done: false
        }))
    )
    const stageRoute = (e: { sourceId: string | null }): Partial<CalendarItem> | null => {
      const appId = e.sourceId ? this.jobs.applicationOfStage(e.sourceId) : null
      return appId ? { source: 'interview', ref: { type: 'application', id: appId } } : null
    }
    this.calendar.decorateSource('job_stage', stageRoute)
    this.calendar.decorateSource('job_stage_deadline', stageRoute)
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
      github: {
        status: async () => this.github.status(),
        setToken: async (args) => {
          this.github.setToken(githubTokenSchema.parse(args).token)
          return this.github.status()
        },
        repos: async (args) => this.github.repos(this.devProjects.repoIndex(), !!args?.force),
        issues: async (args) => this.github.issues(args?.repo, !!args?.force),
        commits: async (args) => this.github.commits(this.devProjects.repoIndex(), args?.repo, !!args?.force)
      },
      review: {
        get: async (args) => this.review.get(args?.weekStart),
        saveNotes: async (input) => {
          const { weekStart, summary, plan } = reviewNotesSchema.parse(input)
          this.review.saveNotes(weekStart, { summary, plan })
        },
        list: async () => this.review.list()
      },
      capture: {
        info: async () => this.capture.info(),
        regenerateKey: async () => {
          this.capture.regenerate()
          return this.capture.info()
        },
        openExtensionDir: async () => {
          await shell.openPath(this.capture.extensionDir)
        }
      }
    }
    const quickAdd = new QuickAddService(modulesApi, this.db)
    const refArg = entityRefSchema

    return {
      ...modulesApi,
      tags: {
        list: async () => this.tags.list(),
        create: async (input) => this.tags.create(input),
        update: async (args) => {
          const { id, patch } = z.object({ id: idArg, patch: z.record(z.string(), z.unknown()) }).parse(args)
          return this.tags.update(id, patch)
        },
        remove: async (id) => this.tags.remove(idArg.parse(id)),
        entities: async (tagId) => this.tags.entities(idArg.parse(tagId))
      },
      links: {
        list: async (ref) => this.links.list(refArg.parse(ref)),
        create: async (input) => this.links.create(input),
        remove: async (id) => this.links.remove(idArg.parse(id))
      },
      pins: {
        list: async (kind) => this.pins.list(z.enum(PIN_KINDS).optional().parse(kind)),
        toggle: async (args) => {
          const { ref, kind } = z.object({ ref: refArg, kind: z.enum(PIN_KINDS) }).parse(args)
          if (!this.registry.findRow(ref)) throw new Error('Объект не найден')
          return this.pins.toggle(ref, kind)
        },
        state: async (ref) => this.pins.state(refArg.parse(ref)),
        reorder: async (args) => {
          const { kind, refs } = z.object({ kind: z.enum(PIN_KINDS), refs: z.array(refArg) }).parse(args)
          this.pins.reorder(kind, refs)
        }
      },
      search: {
        query: async (q) => {
          const query = searchQuerySchema.parse(q)
          const hits = this.search.query(query)
          const subtitles = new Map(this.registry.summarize(hits).map((s) => [`${s.type}:${s.id}`, s]))
          return hits
            .filter((h) => subtitles.has(`${h.type}:${h.id}`))
            .map((h) => ({ ...h, ...subtitles.get(`${h.type}:${h.id}`)!, snippet: h.snippet, rank: h.rank }))
        },
        recent: async (limit) => this.dashboard.recent(z.number().int().min(1).max(50).optional().parse(limit))
      },
      trash: {
        list: async () => this.trash.list(),
        restore: async (ref) => {
          this.trash.restore(refArg.parse(ref))
          this.bus.dataChanged('all')
        },
        purge: async (ref) => this.trash.purge(refArg.parse(ref)),
        empty: async () => this.trash.empty()
      },
      files: {
        list: async (ref) => this.attachments.list(refArg.parse(ref)),
        add: async (args) => {
          const { ref, source } = z.object({ ref: refArg, source: fileSourceSchema }).parse(args)
          return this.attachments.add(ref, source)
        },
        remove: async (id) => this.attachments.remove(idArg.parse(id)),
        open: async (id) => this.attachments.open(idArg.parse(id)),
        reveal: async (id) => this.attachments.reveal(idArg.parse(id)),
        clipboardHasImage: async () => this.files.clipboardHasImage()
      },
      backup: {
        list: async () => this.backup.list(),
        create: async (args) => this.backup.create(z.object({ saveAs: z.boolean() }).parse(args)),
        restore: async (args) => this.backup.restore(z.object({ path: z.string().optional() }).parse(args ?? {}).path),
        export: async (format) => this.exporter.export(z.enum(EXPORT_FORMATS).parse(format))
      },
      settings: {
        get: async () => this.config.settings,
        update: async (patch) => {
          const s = this.config.updateSettings(settingsPatchSchema.parse(patch))
          if (this.shortcuts.lastError) throw new Error(this.shortcuts.lastError)
          return s
        },
        info: async () => ({
          version: app.getVersion(),
          dataDir: this.paths.dataDir,
          filesDir: this.paths.filesDir,
          backupsDir: this.paths.backupsDir,
          platform: process.platform,
          lastBackupAt: this.config.lastBackupAt,
          logFile: logFilePath(),
          dbSizeBytes: (() => {
            try {
              return statSync(this.paths.dbFile).size
            } catch {
              return 0
            }
          })()
        }),
        openDataDir: async () => {
          await shell.openPath(this.paths.dataDir)
        },
        openLogs: async () => {
          await shell.openPath(dirname(logFilePath()))
        }
      },
      updates: {
        status: async () => this.updater.get(),
        check: async () => this.updater.check(),
        install: async () => this.updater.install()
      },
      app: {
        dashboard: async () => this.dashboard.get(),
        quickAdd: async (input) => quickAdd.add(input),
        closeQuickAdd: async () => this.windows.hideQuickAdd(),
        showMain: async (args) => {
          const { route } = z.object({ route: z.string().max(500).optional() }).parse(args ?? {})
          this.windows.showMain(route)
        },
        openExternal: async (url) => {
          const u = z.string().url().parse(url)
          if (!/^(https?|mailto):/i.test(u)) throw new Error('Можно открывать только http(s) и mailto ссылки')
          await shell.openExternal(u)
        },
        copyText: async (text) => clipboard.writeText(z.string().max(5_000_000).parse(text)),
        logError: async (args) => {
          const e = z.object({ message: z.string().max(5000), stack: z.string().max(20_000).optional(), source: z.string().max(200).optional() }).parse(args)
          log.error(`[renderer${e.source ? `:${e.source}` : ''}] ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
        },
        setWindowTheme: async (theme) => this.windows.applyOverlay(z.enum(['light', 'dark']).parse(theme))
      }
    }
  }
}
