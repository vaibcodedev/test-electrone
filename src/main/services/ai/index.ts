import type { AiApi } from '@shared/api'
import {
  aiConfigPatchSchema,
  aiKeySchema,
  aiPreset,
  aiSettingsSchema,
  aiSuggestTagsSchema,
  isLocalUrl,
  type AiConfigPatch,
  type AiProtocol,
  type AiSettings,
  type AiStatus,
  type AiSuggestTagsInput,
  type AiTagSuggestion,
  type AiTestResult,
  type AiUsage
} from '@shared/domain/ai'
import type { EntityRef, Tag, TagWithUsage } from '@shared/domain/common'
import { dayKey, NotFoundError, now as clock, UserError } from '../../core/util'
import { log } from '../../core/logger'
import {
  AiOverloadedError,
  type AiAdapter,
  type AiConnection,
  type AiReply,
  type AiRequest
} from './adapter'
import { buildTagPrompt, parseTagReply, TAG_SYSTEM, toSuggestions } from './tags'

/** The slice of ConfigStore the service needs (ConfigStore implements it). */
export interface AiStore {
  readonly aiSettings: AiSettings
  updateAiSettings(next: AiSettings): void
  aiUsage: AiUsage
  secret(key: string): string | null
  setSecret(key: string, value: string | null): void
}

/** SecretBox: the OS keychain (safeStorage / DPAPI). */
export interface AiSecrets {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

/** Records and tags, read through the EntityRegistry (container wires it). */
export interface AiRecords {
  /** The text search indexes for a live record; null when it's gone or in the trash. */
  text(ref: EntityRef): { title: string; body: string } | null
  tagsOf(ref: EntityRef): Tag[]
  allTags(): TagWithUsage[]
}

export interface AiDeps {
  store: AiStore
  secrets: AiSecrets
  records: AiRecords
  adapters: Record<AiProtocol, AiAdapter>
  now?: () => number
}

/** Cloud answers in seconds; a local model may first spend a minute loading into memory. */
const TIMEOUT = { cloud: 30_000, local: 120_000 }
/** Not chat models in a provider's list (OpenAI, Groq, Mistral list embeddings, speech, images, moderation too). */
const NOT_CHAT_MODEL =
  /embed|whisper|tts|speech|transcri|dall-e|image|moderation|audio|realtime|rerank|guard/i
const SETTINGS_HINT = 'Налаштування → Штучний інтелект'

const keyName = (preset: string): string => `ai:${preset}`

/**
 * «Штучний інтелект» on the person's own key. Requests go only from main (net.fetch); the key is stored with
 * the OS keychain and never reaches the renderer — the status shows its last four characters. A daily cap on
 * requests guards the bill; today's requests and tokens are counted and survive a restart.
 */
export class AiService {
  private readonly inflight = new Set<AbortController>()
  private readonly now: () => number

  constructor(private readonly deps: AiDeps) {
    this.now = deps.now ?? clock
  }

  private get settings(): AiSettings {
    return this.deps.store.aiSettings
  }

  /** The saved key of a preset; throws a plain reason when it can't be decrypted on this computer. */
  private key(preset: string): string | null {
    const stored = this.deps.store.secret(keyName(preset))
    return stored ? this.deps.secrets.decrypt(stored) : null
  }

  private usage(): AiUsage {
    const today = dayKey(this.now())
    const u = this.deps.store.aiUsage
    return u.day === today ? u : { day: today, requests: 0, inputTokens: 0, outputTokens: 0 }
  }

  /** Where and how to send, or the first thing still missing (in Ukrainian). */
  private resolve(s: AiSettings): {
    conn: AiConnection | null
    missing: string | null
    keyHint: string | null
  } {
    const preset = aiPreset(s.preset)
    const baseUrl = preset.id === 'custom' ? s.baseUrl : preset.baseUrl
    const local = preset.local || (preset.id === 'custom' && isLocalUrl(baseUrl))
    let apiKey: string | null = null
    let keyProblem: string | null = null
    try {
      apiKey = this.key(preset.id)
    } catch (e) {
      keyProblem = (e as Error).message
    }
    const keyHint = apiKey ? (apiKey.length >= 8 ? apiKey.slice(-4) : '') : null
    const model = s.model || preset.model
    const missing = keyProblem
      ? 'Ключ зашифровано на іншому комп’ютері — вставте його знову'
      : !baseUrl
        ? 'Вкажіть адресу сервісу'
        : preset.needsKey && !apiKey
          ? `Додайте ключ ${preset.short}`
          : !model && !local
            ? 'Вкажіть модель'
            : null
    return { conn: missing ? null : { preset, baseUrl, apiKey, model, local }, missing, keyHint }
  }

  status(): AiStatus {
    const s = this.settings
    const { conn, missing, keyHint } = this.resolve(s)
    const preset = aiPreset(s.preset)
    const local = conn?.local ?? (preset.local || (preset.id === 'custom' && isLocalUrl(s.baseUrl)))
    const usage = this.usage()
    // consented is internal: it's given in the warning, not on the settings screen.
    const { consented, ...settings } = s
    return {
      settings,
      baseUrl: preset.id === 'custom' ? s.baseUrl : preset.baseUrl,
      model: s.model || preset.model,
      local,
      keyHint,
      missing,
      ready: s.enabled && !missing,
      consented: local || consented.includes(s.preset),
      usage: {
        requests: usage.requests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        limit: s.dailyLimit
      }
    }
  }

  setConfig(patch: AiConfigPatch): AiStatus {
    const data = aiConfigPatchSchema.parse(patch)
    const current = this.settings
    const next = aiSettingsSchema.parse({ ...current, ...data })
    // Another provider's model name would only fail: the new one starts from its recommended model.
    if (data.preset && data.preset !== current.preset && data.model === undefined) next.model = ''
    if (
      next.preset !== current.preset ||
      next.baseUrl !== current.baseUrl ||
      next.model !== current.model
    )
      this.cancel()
    this.deps.store.updateAiSettings(next)
    return this.status()
  }

  /** Saves the key of the chosen provider (each provider keeps its own). */
  setKey(args: { key: string }): AiStatus {
    const key = aiKeySchema.parse(args).key.replace(/^Bearer\s+/i, '')
    if (/\s/.test(key)) throw new UserError('У ключі не може бути пробілів — скопіюйте його ще раз')
    this.deps.store.setSecret(keyName(this.settings.preset), this.deps.secrets.encrypt(key))
    return this.status()
  }

  clearKey(): AiStatus {
    this.cancel()
    this.deps.store.setSecret(keyName(this.settings.preset), null)
    return this.status()
  }

  /** Aborts every request in flight (another provider chosen, the record closed). */
  cancel(): void {
    for (const c of this.inflight) c.abort()
    this.inflight.clear()
  }

  private connection(): AiConnection {
    const { conn, missing } = this.resolve(this.settings)
    if (!conn) throw new UserError(`${missing} — ${SETTINGS_HINT}`)
    return conn
  }

  /** One model call: the daily cap first, usage counted from the answer, cancellable through `cancel()`. */
  private async send(
    conn: AiConnection,
    req: Omit<AiRequest, 'timeoutMs' | 'signal'>
  ): Promise<AiReply> {
    const s = this.settings
    const before = this.usage()
    if (before.requests >= s.dailyLimit)
      throw new UserError(
        `Денний ліміт вичерпано: ${before.requests} з ${s.dailyLimit} запитів. Змінити його можна в ${SETTINGS_HINT}`
      )
    const controller = new AbortController()
    this.inflight.add(controller)
    const timeoutMs = conn.local ? TIMEOUT.local : TIMEOUT.cloud
    try {
      const adapter = this.deps.adapters[conn.preset.protocol]
      let model = conn.model
      if (!model) {
        // LM Studio (or a local server) without a model chosen: the one it has loaded.
        model = (await adapter.models(conn, { timeoutMs, signal: controller.signal }))[0] ?? ''
        if (!model)
          throw new UserError(
            `У ${conn.preset.short} не завантажено жодної моделі — завантажте модель і спробуйте ще раз`
          )
      }
      const call = (m: string): ReturnType<typeof adapter.complete> =>
        adapter.complete({ ...conn, model: m }, { ...req, timeoutMs, signal: controller.signal })
      let reply: Awaited<ReturnType<typeof adapter.complete>>
      try {
        reply = await call(model)
      } catch (e) {
        // Still overloaded after the retries: the preset's spare model, once — only while the model field is
        // empty (the preset's own choice), never instead of a model the person picked.
        const spare = conn.preset.fallbackModel
        if (!(e instanceof AiOverloadedError) || !spare || this.settings.model || spare === model)
          throw e
        log.warn(`[ai] ${conn.preset.id} ${model} overloaded, trying ${spare}`)
        reply = await call(spare)
      }
      const u = this.usage()
      this.deps.store.aiUsage = {
        day: u.day,
        requests: u.requests + 1,
        inputTokens: u.inputTokens + reply.inputTokens,
        outputTokens: u.outputTokens + reply.outputTokens
      }
      return reply
    } finally {
      this.inflight.delete(controller)
    }
  }

  /** «Перевірити підключення»: a tiny request (no record text), works before the switch is on. */
  async test(): Promise<AiTestResult> {
    const conn = this.connection()
    const started = this.now()
    const reply = await this.send(conn, {
      system: 'You are a connection check. Reply with the single word OK.',
      prompt: 'ping',
      // Room for a reasoning model's thinking before the one word.
      maxTokens: 512,
      effort: 'low'
    })
    log.info(`[ai] ${conn.preset.id} connection ok (${reply.model})`)
    return { model: reply.model, ms: this.now() - started }
  }

  /**
   * «Модель» in the settings: the chat models the chosen provider offers this key, sorted. Not a generation —
   * no daily limit, no usage; works before the switch is on, like the connection check.
   */
  async models(): Promise<string[]> {
    const conn = this.connection()
    const controller = new AbortController()
    this.inflight.add(controller)
    try {
      const list = await this.deps.adapters[conn.preset.protocol].models(conn, {
        timeoutMs: conn.local ? TIMEOUT.local : TIMEOUT.cloud,
        signal: controller.signal
      })
      return [...new Set(list)]
        .filter((id) => !NOT_CHAT_MODEL.test(id))
        .sort((a, b) => a.localeCompare(b))
    } finally {
      this.inflight.delete(controller)
    }
  }

  /**
   * Checks before a feature's request: AI is switched on and set up; a cloud provider gets record texts only
   * after the person agreed once — `consent` says they just did in the warning, and it is remembered.
   */
  private ready(opts: { recordText: boolean; consent?: boolean }): AiConnection {
    const s = this.settings
    if (!s.enabled)
      throw new UserError(`Штучний інтелект вимкнено — увімкніть його в ${SETTINGS_HINT}`)
    const conn = this.connection()
    if (opts.recordText && !conn.local && !s.consented.includes(s.preset)) {
      if (!opts.consent)
        throw new UserError(
          `Спершу підтвердьте, що текст запису можна надіслати ${conn.preset.short}`
        )
      this.deps.store.updateAiSettings({ ...s, consented: [...s.consented, s.preset] })
    }
    return conn
  }

  /**
   * One request of a feature (the chat): the same checks, daily limit and usage counter as every other one.
   * `recordText` — the request carries texts of the person's records (asks for consent before the cloud).
   */
  async request(
    req: Omit<AiRequest, 'timeoutMs' | 'signal'>,
    opts: { recordText: boolean; consent?: boolean }
  ): Promise<AiReply> {
    return this.send(this.ready(opts), req)
  }

  async suggestTags(input: AiSuggestTagsInput): Promise<AiTagSuggestion[]> {
    const { ref, consent } = aiSuggestTagsSchema.parse(input)
    const conn = this.ready({ recordText: true, consent })
    const text = this.deps.records.text(ref)
    if (!text) throw new NotFoundError(ref.type, ref.id)
    if (!text.title.trim() && !text.body.trim())
      throw new UserError('Запис порожній — додайте текст, і ШІ запропонує мітки')
    const existing = this.deps.records.allTags()
    const current = this.deps.records.tagsOf(ref)
    const reply = await this.send(conn, {
      system: TAG_SYSTEM,
      prompt: buildTagPrompt({ ...text, existing, current }),
      maxTokens: 2048,
      effort: 'low'
    })
    const suggestions = toSuggestions(parseTagReply(reply.text), existing, current)
    if (!suggestions.length) {
      log.warn(`[ai] no tags in the answer: ${reply.text.slice(0, 200)}`)
      throw new UserError(
        'ШІ не запропонував нових міток — спробуйте ще раз або додайте більше тексту'
      )
    }
    return suggestions
  }

  api(): AiApi {
    return {
      status: async () => this.status(),
      setConfig: async (patch) => this.setConfig(patch),
      setKey: async (args) => this.setKey(args),
      clearKey: async () => this.clearKey(),
      test: () => this.test(),
      models: () => this.models(),
      suggestTags: (input) => this.suggestTags(input),
      cancel: async () => this.cancel()
    }
  }
}
