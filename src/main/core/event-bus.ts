import { BrowserWindow } from 'electron'
import type { MainEventName, MainEvents } from '@shared/api'
import type { EntityType } from '@shared/entity-types'

/** Broadcasts main → renderer events to every open window. */
export class EventBus {
  private readonly local = new Set<(payload: MainEvents['data:changed']) => void>()

  emit<E extends MainEventName>(event: E, payload: MainEvents[E]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(event, payload)
    }
    if (event === 'data:changed') for (const cb of this.local) cb(payload as MainEvents['data:changed'])
  }

  /** Main-process listeners (tray menu…) for data changes made from any window. */
  onDataChanged(cb: (payload: MainEvents['data:changed']) => void): () => void {
    this.local.add(cb)
    return () => this.local.delete(cb)
  }

  dataChanged(types: EntityType[] | 'all'): void {
    this.emit('data:changed', { types })
  }
}
