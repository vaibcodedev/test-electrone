import { rm } from 'fs/promises'
import type { StorageFreed } from '@shared/domain/system'
import { log } from './logger'
import { UserError } from './util'

/** Windows reports a file another program holds open with one of these. */
const BUSY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])

/**
 * Removes the planned files one by one («Сховище» cleanups). A file held by another program is skipped
 * and logged: the rest still go, and the result tells how much was really freed. Nothing removed at all
 * → a readable error instead of a «звільнено 0 Б» that hides the cause.
 */
export async function removeFiles(
  plan: { path: string; size: number }[],
  what: string
): Promise<StorageFreed> {
  let freedBytes = 0
  let removed = 0
  for (const f of plan) {
    try {
      await rm(f.path, { force: true })
      freedBytes += f.size
      removed++
    } catch (e) {
      if (!BUSY_CODES.has((e as NodeJS.ErrnoException).code ?? '')) throw e
      log.warn(`[storage] ${what} is in use, skipped`, f.path, e)
    }
  }
  if (plan.length && !removed)
    throw new UserError('Файли зараз використовує інша програма — закрийте її й спробуйте ще раз')
  return { freedBytes, removed }
}
