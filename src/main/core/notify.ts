import { Notification, type NotificationConstructorOptions } from 'electron'

/**
 * Shown notifications stay referenced until closed: on Windows a collected Notification object loses
 * its 'click' handler, and a click on «Співбесіда о 15:00» would open nothing.
 */
const alive = new Set<Notification>()

/**
 * «Тест · » in «Тестовий режим»: a reminder from the test data must not pass for a real one. Module state on
 * purpose (set once at startup, like configureZod) instead of passing the profile into every caller.
 */
let titlePrefix = ''
export function setNotificationPrefix(prefix: string): void {
  titlePrefix = prefix
}

export function showNotification(opts: NotificationConstructorOptions, onClick?: () => void): void {
  // Automated runs (e2e, snap and audit scripts) set it: their test data («Видео про Electron» captured by the
  // seed) popped real Windows notifications on the desktop of whoever ran them.
  if (process.env.VAULT_NO_NOTIFY === '1' || !Notification.isSupported()) return
  const n = new Notification(titlePrefix ? { ...opts, title: titlePrefix + (opts.title ?? '') } : opts)
  alive.add(n)
  const drop = (): void => {
    alive.delete(n)
  }
  n.on('click', () => {
    drop()
    onClick?.()
  })
  n.on('close', drop)
  n.on('failed', drop)
  n.show()
}
