import { app } from 'electron'
import log from 'electron-log/main'
import { join } from 'path'
import type { ProfileKind } from '@shared/domain/sandbox'

/**
 * Central log (electron-log): <userData>/logs/main.log, 5 MB with one rotated .old.log.
 * - the folder follows userData, not electron-log's %APPDATA%/<package name>/logs: dev (vault-dev) and
 *   tests (--user-data-dir) write their own log, and «Старі журнали» never reaches the installed Vault's
 *   log. For the installed app the path is the same as before;
 * - main-process console.* is redirected into it;
 * - uncaught errors / unhandled rejections are caught (no crash dialogs);
 * - renderer errors arrive through rpc `app.logError` (no extra preload needed under sandbox).
 */
export function setupLogging(opts: { dir?: string; profile?: ProfileKind } = {}): typeof log {
  // Before the first write: index.ts has already moved userData for dev, tests and «Тестовий режим».
  log.transports.file.resolvePathFn = (v) =>
    join(opts.dir ?? join(app.getPath('userData'), 'logs'), v.fileName ?? 'main.log')
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope}{text}'
  log.transports.console.level = app.isPackaged ? false : 'debug'
  Object.assign(console, log.functions)
  log.errorHandler.startCatching({
    showDialog: false,
    onError({ error, processType }) {
      log.error(`[uncaught:${processType}]`, error)
      return false
    }
  })
  const tag = opts.profile === 'sandbox' ? ' [sandbox]' : ''
  log.info(
    `Vault ${app.getVersion()} started (electron ${process.versions.electron}, ${process.platform})${tag}`
  )
  return log
}

export function logFilePath(): string {
  return log.transports.file.getFile().path
}

export { log }
