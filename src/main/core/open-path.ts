import { shell } from 'electron'
import { log } from './logger'
import { UserError } from './util'

/**
 * Opens a file or folder in its default app. shell.openPath reports failure as a returned English string,
 * not an exception: without this a missing folder made the button silently do nothing.
 */
export async function openPathOrThrow(abs: string, message: string): Promise<void> {
  const err = await shell.openPath(abs)
  if (err) {
    log.warn('[open]', abs, err)
    throw new UserError(message)
  }
}
