import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { z, ZodError } from 'zod'
import { uk } from 'zod/locales'

// Validation messages reach the UI as toasts → Ukrainian, not «Too big: expected number to be <=…».
z.config(uk())
// The common cases in plain words (the stock locale says «очікується, що number буде <=…»).
z.config({
  customError: (issue) => {
    const fmt = (n: unknown): string => (typeof n === 'number' ? n.toLocaleString('uk-UA') : String(n))
    if (issue.code === 'too_big')
      return issue.origin === 'string' ? `занадто довго — максимум ${fmt(issue.maximum)} символів` : `забагато — максимум ${fmt(issue.maximum)}`
    if (issue.code === 'too_small')
      return issue.origin === 'string'
        ? Number(issue.minimum) <= 1
          ? 'не може бути порожнім'
          : `закоротко — мінімум ${fmt(issue.minimum)} символів`
        : `замало — мінімум ${fmt(issue.minimum)}`
    if (issue.code === 'invalid_format' && issue.format === 'url') return 'не схоже на посилання'
    if (issue.code === 'invalid_format' && issue.format === 'email') return 'не схоже на пошту'
    return undefined
  }
})

/** Human names for fields in validation errors; unknown paths fall back to the key. */
const FIELD_LABEL: Record<string, string> = {
  amount: 'Сума',
  currency: 'Валюта',
  title: 'Назва',
  name: 'Назва',
  url: 'Посилання',
  email: 'Пошта',
  phone: 'Телефон',
  fixedPrice: 'Вартість проєкту',
  hourlyRate: 'Погодинна ставка',
  rate: 'Ставка',
  feePercent: 'Комісія',
  budgetHours: 'Бюджет годин',
  minutes: 'Хвилини',
  progress: 'Прогрес',
  rating: 'Рейтинг',
  dueAt: 'Строк',
  startAt: 'Початок',
  endAt: 'Кінець',
  credits: 'Конекти',
  question: 'Питання',
  answer: 'Відповідь',
  code: 'Код',
  body: 'Текст',
  description: 'Опис',
  notes: 'Нотатки'
}
import { RPC_CHANNEL, type Api, type RpcResult } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import type { EventBus } from '../core/event-bus'
import { log } from '../core/logger'

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
    const key = String(first?.path[first.path.length - 1] ?? '')
    const field = FIELD_LABEL[key] ?? (first?.path.join('.') || 'значення')
    return { error: `${field}: ${first?.message ?? 'некоректне значення'}`, code: 'VALIDATION' }
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
  jobs: ['application', 'company', 'question', 'event'],
  importer: ['checklist', 'question', 'word', 'snippet', 'template', 'redflag', 'idea', 'bookmark', 'library']
}
const READ_METHODS =
  /^(list|get|details|due|feed|queue|stats|palette|overview|running|reveal|state|query|recent|info|status|dashboard|niches|stale|summary|progress|folders|month|income|subscriptions|subscriptionMonth|expenses|withdrawals|boards|daily|followUps|upcoming|pastStages|companies|company|resumes|questions|question|topics|practiceQueue|practiceExtra|runs|logs|repos|issues|commits|pickFolder|scan)$/

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
      // Validation/user errors are expected (warn); anything else is a bug (error with stack).
      if (e instanceof ZodError || (e as { code?: string }).code) log.warn(`[rpc] ${path}: ${(e as Error).message}`)
      else log.error(`[rpc] ${path}`, e)
      return { ok: false, ...formatError(e) }
    }
  })
}
