import { app, clipboard, shell } from 'electron'
import { statSync } from 'fs'
import { dirname } from 'path'
import { z } from 'zod'
import type { AppApi, SettingsApi, UpdatesApi } from '@shared/api'
import { settingsPatchSchema } from '@shared/domain/system'
import type { AppPaths } from '../core/paths'
import type { ConfigStore } from '../core/config-store'
import { log, logFilePath } from '../core/logger'
import { openPathOrThrow } from '../core/open-path'
import { UserError } from '../core/util'
import type { DashboardService } from '../services/dashboard-service'
import type { QuickAddService } from '../services/quick-add-service'
import type { ShortcutController } from './shortcuts'
import type { Updater } from './updater'
import type { WindowManager } from './window-manager'

/** The app-level namespaces of the Api: settings, updates and the shell around the windows. */
export class AppApiFactory {
  constructor(
    private readonly deps: {
      paths: AppPaths
      config: ConfigStore
      shortcuts: ShortcutController
      updater: Updater
      windows: WindowManager
      dashboard: DashboardService
      quickAdd: QuickAddService
    }
  ) {}

  settings(): SettingsApi {
    const { config, paths, shortcuts } = this.deps
    return {
      get: async () => config.settings,
      update: async (patch) => {
        const p = settingsPatchSchema.parse(patch)
        // A busy/invalid hotkey is refused before saving: config.json keeps the working one.
        if (p.quickAddShortcut !== undefined && p.quickAddShortcut !== config.settings.quickAddShortcut) {
          const err = shortcuts.apply(p.quickAddShortcut)
          if (err) throw new UserError(err)
        }
        return config.updateSettings(p)
      },
      info: async () => ({
        version: app.getVersion(),
        dataDir: paths.dataDir,
        filesDir: paths.filesDir,
        backupsDir: paths.backupsDir,
        platform: process.platform,
        lastBackupAt: config.lastBackupAt,
        logFile: logFilePath(),
        dbSizeBytes: (() => {
          try {
            return statSync(paths.dbFile).size
          } catch {
            return 0
          }
        })()
      }),
      openDataDir: () => openPathOrThrow(paths.dataDir, 'Не вдалося відкрити папку — можливо, її видалено'),
      openLogs: () => openPathOrThrow(dirname(logFilePath()), 'Не вдалося відкрити папку — можливо, її видалено')
    }
  }

  updates(): UpdatesApi {
    const { updater } = this.deps
    return {
      status: async () => updater.get(),
      check: async () => updater.check(),
      install: async () => updater.install()
    }
  }

  app(): AppApi {
    const { windows, dashboard, quickAdd } = this.deps
    return {
      dashboard: async () => dashboard.get(),
      quickAdd: async (input) => quickAdd.add(input),
      closeQuickAdd: async () => windows.hideQuickAdd(),
      showMain: async (args) => {
        const { route } = z.object({ route: z.string().max(500).optional() }).parse(args ?? {})
        windows.showMain(route)
      },
      openExternal: async (url) => {
        const u = z.string().url().parse(url)
        if (!/^(https?|mailto):/i.test(u)) throw new UserError('Відкривати можна лише посилання http(s) і mailto')
        await shell.openExternal(u)
      },
      copyText: async (text) => clipboard.writeText(z.string().max(5_000_000).parse(text)),
      logError: async (args) => {
        const e = z
          .object({ message: z.string().max(5000), stack: z.string().max(20_000).optional(), source: z.string().max(200).optional() })
          .parse(args)
        log.error(`[renderer${e.source ? `:${e.source}` : ''}] ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
      },
      setWindowTheme: async (theme) => windows.applyOverlay(z.enum(['light', 'dark']).parse(theme))
    }
  }
}
