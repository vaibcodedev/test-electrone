import { app } from 'electron'
import log from 'electron-log/main'

/**
 * Central log (electron-log): %APPDATA%/<app>/logs/main.log, 5 MB with one rotated .old.log.
 * - main-process console.* is redirected into it;
 * - uncaught errors / unhandled rejections are caught (no crash dialogs);
 * - renderer errors arrive through rpc `app.logError` (no extra preload needed under sandbox).
 */
export function setupLogging(): typeof log {
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
  log.info(`Vault ${app.getVersion()} started (electron ${process.versions.electron}, ${process.platform})`)
  return log
}

export function logFilePath(): string {
  return log.transports.file.getFile().path
}

export { log }
