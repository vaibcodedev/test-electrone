import { BrowserWindow } from 'electron'
import type { MainEventName, MainEvents } from '@shared/api'
import type { EntityType } from '@shared/entity-types'

/** Broadcasts main → renderer events to every open window. */
export class EventBus {
  emit<E extends MainEventName>(event: E, payload: MainEvents[E]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(event, payload)
    }
  }

  dataChanged(types: EntityType[] | 'all'): void {
    this.emit('data:changed', { types })
  }
}
