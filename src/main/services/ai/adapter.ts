import type { AiPreset } from '@shared/domain/ai'
import { UserError } from '../../core/util'
import { log } from '../../core/logger'

/** `net.fetch` in the app (Chromium's stack: system proxy, certificates), a stub in unit tests. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>

/** Everything one request needs; built by AiService from the settings and the decrypted key. */
export interface AiConnection {
  preset: AiPreset
  baseUrl: string
  /** null — no key (local apps, «Своя адреса» without one). Never logged. */
  apiKey: string | null
  model: string
  local: boolean
}

/** An earlier turn of a chat, sent before the new prompt. */
export interface AiTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AiRequest {
  system: string
  prompt: string
  /** Earlier turns of a chat, oldest first; the prompt is the newest user turn. */
  history?: AiTurn[]
  /** Cap on the reply, thinking included (reasoning models count it here too). */
  maxTokens: number
  /** Anthropic `output_config.effort` for models that take it; short utility tasks pass 'low'. */
  effort?: 'low' | 'medium' | 'high'
  timeoutMs: number
  /** Cancels the request (another provider chosen, the record closed). */
  signal?: AbortSignal
}

export interface AiReply {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

/** One wire format (Anthropic Messages / OpenAI Chat Completions) behind the same two calls. */
export interface AiAdapter {
  complete(conn: AiConnection, req: AiRequest): Promise<AiReply>
  /** Model ids the server offers (LM Studio has no fixed default: the first loaded one is used). */
  models(conn: AiConnection, req: Pick<AiRequest, 'timeoutMs' | 'signal'>): Promise<string[]>
}

/** Busy or briefly failing servers: one more try after a short pause. 429 is not retried — it's a quota. */
const RETRY_STATUSES = new Set([500, 502, 503, 504, 529])
/** «High demand» (503 / Anthropic's 529) passes in seconds: two more tries, 2 s and 5 s apart. */
const OVERLOAD_STATUSES = new Set([503, 529])
const OVERLOAD_WAITS_MS = [2000, 5000]
const MAX_RETRIES = 1

/** The provider is overloaded: AiService may try the preset's fallback model before giving up. */
export class AiOverloadedError extends UserError {}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** The provider's own error text (English, technical): for the log only. */
function providerMessage(body: string): string {
  try {
    const data = JSON.parse(body) as { error?: unknown; message?: unknown }
    const err = data.error
    if (err && typeof err === 'object' && 'message' in err)
      return String((err as { message: unknown }).message)
    if (typeof err === 'string') return err
    if (typeof data.message === 'string') return data.message
  } catch {
    /* not JSON: the text itself */
  }
  return body.slice(0, 300)
}

function offline(conn: AiConnection): UserError {
  const { short, startHint } = conn.preset
  if (conn.local)
    return new UserError(
      `${capitalize(short)} не відповідає — ${startHint ?? 'перевірте адресу й чи запущено сервіс'}`
    )
  if (conn.preset.id === 'custom')
    return new UserError('Немає зв’язку із сервісом — перевірте інтернет і адресу')
  return new UserError(`Немає зв’язку з ${short} — перевірте інтернет`)
}

function timedOut(conn: AiConnection, ms: number): UserError {
  const s = Math.max(1, Math.round(ms / 1000))
  const who = capitalize(conn.preset.short)
  return conn.local
    ? new UserError(
        `${who} не відповів за ${s} с — модель ще завантажується або комп’ютеру важко. Спробуйте ще раз`
      )
    : new UserError(`${who} не відповів за ${s} с — спробуйте ще раз`)
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** Status → what the person can do about it, in Ukrainian. */
export function httpError(
  conn: AiConnection,
  status: number,
  body: string,
  headers?: Headers
): UserError {
  const who = capitalize(conn.preset.short)
  const detail = providerMessage(body)
  log.warn(`[ai] ${conn.preset.id} ${status}: ${detail}`)
  // Gemini answers a wrong key with 400 «API key not valid».
  if (status === 401 || status === 403 || (status === 400 && /api[\s_-]?key/i.test(detail))) {
    return conn.apiKey || !conn.local
      ? new UserError(
          `Ключ не підходить — ${who} його не прийняв. Перевірте ключ або створіть новий`
        )
      : new UserError(`${who} просить ключ — додайте його в налаштуваннях`)
  }
  if (status === 402)
    return new UserError(`На рахунку ${conn.preset.short} закінчилися кошти — поповніть баланс`)
  if (status === 404) {
    if (conn.preset.id === 'ollama')
      return new UserError(
        `Модель «${conn.model}» не встановлена в Ollama — виконайте «ollama pull ${conn.model}» або вкажіть іншу`
      )
    return new UserError(
      conn.preset.id === 'custom'
        ? `Сервіс не знайшов модель «${conn.model}» — перевірте назву моделі й адресу`
        : `${who} не знайшов модель «${conn.model}» — перевірте назву моделі`
    )
  }
  if (status === 429) {
    const wait = Number(headers?.get('retry-after'))
    const when =
      Number.isFinite(wait) && wait > 0 && wait <= 3600 ? ` за ${Math.ceil(wait)} с` : ' пізніше'
    return new UserError(`Ліміт запитів ${conn.preset.short} вичерпано — спробуйте${when}`)
  }
  if (status === 503 || status === 529)
    return new AiOverloadedError(`${who} зараз перевантажений — спробуйте за хвилину`)
  if (status >= 500) return new UserError(`${who} не відповів (код ${status}) — спробуйте пізніше`)
  return new UserError(`${who} відхилив запит (код ${status}) — перевірте модель у налаштуваннях`)
}

interface RawResponse {
  status: number
  headers: Headers
  text: string
}

/**
 * HTTP for the adapters: a timeout and a cancel signal that cover the body too, one retry for a busy server,
 * and errors turned into plain Ukrainian. The English details go to the log, never the key.
 */
export class AiHttp {
  constructor(
    private readonly fetchFn: FetchFn,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms))
  ) {}

  async json<T>(
    conn: AiConnection,
    url: string,
    init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
    req: Pick<AiRequest, 'timeoutMs' | 'signal'>
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.send(conn, url, init, req)
      if (res.status >= 200 && res.status < 300) {
        try {
          return JSON.parse(res.text) as T
        } catch {
          log.warn(`[ai] ${conn.preset.id}: not JSON: ${res.text.slice(0, 200)}`)
          throw new UserError(
            `${capitalize(conn.preset.short)} повернув незрозумілу відповідь — перевірте адресу`
          )
        }
      }
      const overloaded = OVERLOAD_STATUSES.has(res.status)
      const retries = overloaded ? OVERLOAD_WAITS_MS.length : MAX_RETRIES
      if (attempt < retries && RETRY_STATUSES.has(res.status)) {
        const after = Number(res.headers.get('retry-after'))
        const fallback = overloaded ? OVERLOAD_WAITS_MS[attempt] : 1000
        log.warn(`[ai] ${conn.preset.id} ${res.status}, retrying`)
        await this.sleep(
          Number.isFinite(after) && after > 0 && after <= 10 ? after * 1000 : fallback
        )
        if (req.signal?.aborted) throw new UserError('Запит скасовано')
        continue
      }
      throw httpError(conn, res.status, res.text, res.headers)
    }
  }

  private async send(
    conn: AiConnection,
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    req: Pick<AiRequest, 'timeoutMs' | 'signal'>
  ): Promise<RawResponse> {
    if (req.signal?.aborted) throw new UserError('Запит скасовано')
    const controller = new AbortController()
    let expired = false
    const timer = setTimeout(() => {
      expired = true
      controller.abort()
    }, req.timeoutMs)
    const cancel = (): void => controller.abort()
    req.signal?.addEventListener('abort', cancel, { once: true })
    // Rejects on abort even if a fetch implementation ignored the signal: a hung server never hangs Vault.
    const aborted = new Promise<never>((_, reject) =>
      controller.signal.addEventListener('abort', () => reject(new Error('aborted')), {
        once: true
      })
    )
    try {
      const res = await Promise.race([
        this.fetchFn(url, { ...init, signal: controller.signal }),
        aborted
      ])
      const text = await Promise.race([res.text(), aborted])
      return { status: res.status, headers: res.headers, text }
    } catch (e) {
      if (expired) {
        log.warn(`[ai] ${conn.preset.id}: no answer in ${req.timeoutMs} ms`)
        throw timedOut(conn, req.timeoutMs)
      }
      if (req.signal?.aborted) throw new UserError('Запит скасовано')
      log.warn(`[ai] ${conn.preset.id}: network error`, e)
      throw offline(conn)
    } finally {
      clearTimeout(timer)
      req.signal?.removeEventListener('abort', cancel)
    }
  }
}
