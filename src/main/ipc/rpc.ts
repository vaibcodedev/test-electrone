import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { ZodError } from 'zod'
import { RPC_CHANNEL, type Api, type RpcResult } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import type { EventBus } from '../core/event-bus'

/** Only our own pages may call the API (defence against a navigated/injected frame). */
function trustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (url.startsWith('app://renderer/')) return true
  const dev = process.env['ELECTRON_RENDERER_URL']
  return is.dev && !!dev && url.startsWith(dev)
}

function formatError(e: unknown): { error: string; code?: string } {
  if (e instanceof ZodError) {
    const first = e.issues[0]
    return { error: `Некорректные данные: ${first?.path.join('.') || 'value'} — ${first?.message}`, code: 'VALIDATION' }
  }
  if (e instanceof Error) return { error: e.message, code: (e as { code?: string }).code }
  return { error: String(e) }
}

/** Namespaces whose writes should notify other windows (e.g. quick-add → main). */
const NS_TYPES: Partial<Record<keyof Api, EntityType[]>> = {
  ideas: ['idea'],
  boards: ['board', 'card'],
  cards: ['card'],
  claude: ['claude'],
  libraries: ['library'],
  components: ['component'],
  designs: ['design'],
  moodboards: ['moodboard'],
  snippets: ['snippet'],
  clients: ['client'],
  projects: ['project'],
  checklists: ['checklist'],
  fixes: ['fix'],
  bookmarks: ['bookmark'],
  english: ['word'],
  events: ['event'],
  notes: ['note'],
  proposals: ['proposal'],
  templates: ['template'],
  cases: ['case'],
  redflags: ['redflag'],
  platforms: ['proposal'],
  credits: ['proposal'],
  goals: ['proposal'],
  finance: ['project'],
  jobs: ['application', 'company', 'question', 'event']
}
const READ_METHODS =
  /^(list|get|details|due|feed|queue|stats|palette|overview|running|reveal|state|query|recent|info|status|dashboard|niches|stale|summary|progress|folders|month|income|subscriptions|subscriptionMonth|expenses|withdrawals|boards|daily|followUps|upcoming|pastStages|companies|company|resumes|questions|question|topics|practiceQueue|runs|logs|repos|issues|commits|pickFolder|scan)$/

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
      const types = NS_TYPES[ns]
      if (types && !READ_METHODS.test(method)) {
        // Lets other windows (quick add ↔ main) refresh their caches.
        bus.emit('data:changed', { types })
      }
      return { ok: true, data }
    } catch (e) {
      if (is.dev) console.error(`[rpc] ${path}`, e)
      return { ok: false, ...formatError(e) }
    }
  })
}
