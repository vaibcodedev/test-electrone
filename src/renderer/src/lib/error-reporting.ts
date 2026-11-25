import { api } from './api'

let installed = false
const recent = new Map<string, number>()

/** Sends a renderer error to the main log file (deduplicated for 10 s so loops don't flood it). */
export function reportError(error: unknown, source = 'renderer'): void {
  const e = error instanceof Error ? error : new Error(String(error))
  const key = `${source}:${e.message}`
  const nowTs = Date.now()
  if ((recent.get(key) ?? 0) > nowTs - 10_000) return
  recent.set(key, nowTs)
  void api.app
    .logError({ message: e.message.slice(0, 5000), stack: e.stack?.slice(0, 20_000), source })
    .catch(() => undefined)
}

/** Window-level handlers: uncaught errors and unhandled promise rejections. Call once per window. */
export function installErrorReporting(): void {
  if (installed) return
  installed = true
  window.addEventListener('error', (ev) => {
    // Chromium's notice that a ResizeObserver callback resized an observed element in the same frame: the
    // rest is delivered next frame, nothing breaks. Not an error worth the log (the usual practice).
    if (typeof ev.message === 'string' && ev.message.startsWith('ResizeObserver loop')) return
    reportError(ev.error ?? ev.message, 'window')
  })
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'promise'))
}
