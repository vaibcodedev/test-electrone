import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { ZodError } from 'zod'
import { configureZod } from '@shared/zod-locale'
// Validation messages reach the UI as toasts → Ukrainian, in plain words (shared with the renderer).
configureZod()
import { RPC_CHANNEL, type Api, type RpcResult } from '@shared/api'
import type { EventBus } from '../core/event-bus'
import { NotFoundError, UserError } from '../core/util'
import { log } from '../core/logger'
import { changedTypes, formatError } from './rpc-utils'

/** Only our own pages may call the API (defence against a navigated/injected frame). */
function trustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (url.startsWith('app://renderer/')) return true
  const dev = process.env['ELECTRON_RENDERER_URL']
  return is.dev && !!dev && url.startsWith(dev)
}

/**
 * Single IPC entry point: `rpc("ns.method", arg)` → api[ns][method](arg).
 * Methods validate their own input with zod; this layer only routes, guards and serialises errors.
 */
export function registerRpc(api: Api, bus: EventBus): void {
  ipcMain.handle(RPC_CHANNEL, async (event, path: unknown, arg: unknown): Promise<RpcResult> => {
    if (!trustedSender(event)) return { ok: false, error: 'Untrusted sender', code: 'FORBIDDEN' }
    if (typeof path !== 'string') return { ok: false, error: 'Bad path' }
    const [ns, method] = path.split('.') as [keyof Api, string]
    const target = Object.hasOwn(api, ns) ? (api[ns] as unknown as Record<string, unknown>) : undefined
    const fn = target && Object.hasOwn(target, method) ? target[method] : undefined
    if (typeof fn !== 'function') return { ok: false, error: `Unknown method ${path}`, code: 'NOT_FOUND' }
    try {
      const data = await (fn as (a: unknown) => unknown).call(target, arg)
      const types = changedTypes(ns, method, data)
      // Lets other windows (quick add ↔ main) refresh their caches.
      if (types) bus.emit('data:changed', { types })
      return { ok: true, data }
    } catch (e) {
      // Our own expected errors (validation, UserError, not found) are warnings; anything else — SQLite,
      // file system, a plain Error — is a bug: logged with its stack, shown to the user in plain words.
      const expected = e instanceof ZodError || e instanceof UserError || e instanceof NotFoundError
      if (expected) log.warn(`[rpc] ${path}: ${(e as Error).message}${e instanceof NotFoundError ? ` (${e.id})` : ''}`)
      else log.error(`[rpc] ${path}`, e)
      const result = formatError(e)
      if (!expected && !/[А-яЄІЇҐєіїґ]/.test(result.error)) {
        result.error = 'Щось пішло не так — подробиці записано в журнал (Налаштування → Журнал)'
      }
      return { ok: false, ...result }
    }
  })
}
