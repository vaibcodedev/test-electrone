import { Notification, type NotificationConstructorOptions } from 'electron'

/**
 * Shown notifications stay referenced until closed: on Windows a collected Notification object loses
 * its 'click' handler, and a click on «Співбесіда о 15:00» would open nothing.
 */
const alive = new Set<Notification>()

export function showNotification(opts: NotificationConstructorOptions, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const n = new Notification(opts)
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
