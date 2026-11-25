import { z } from 'zod'
import { entityRefSchema, patchOf } from './common'

/* ───────────── Providers ───────────── */

/** Two wire formats cover every provider: Anthropic Messages and OpenAI Chat Completions («OpenAI-сумісний»). */
export const AI_PROTOCOLS = ['anthropic', 'openai'] as const
export type AiProtocol = (typeof AI_PROTOCOLS)[number]

export const AI_PRESET_IDS = [
  'gemini',
  'openrouter',
  'groq',
  'ollama',
  'lmstudio',
  'anthropic',
  'openai',
  'deepseek',
  'mistral',
  'custom'
] as const
export type AiPresetId = (typeof AI_PRESET_IDS)[number]

/**
 * A ready-made provider choice in «Налаштування → Штучний інтелект»: picking it fills the address and the
 * model, and gives the «Отримати ключ» link. Prices and privacy notes are as of 25.11.2026 (план.md, п. 13),
 * for 30–50 short requests a day.
 */
export interface AiPreset {
  id: AiPresetId
  /** Name in the list. */
  name: string
  /** Name inside sentences («Немає зв’язку з Google Gemini»). */
  short: string
  protocol: AiProtocol
  /** API root; '' for «Своя адреса» (the person types it). */
  baseUrl: string
  /** Recommended model, used while the model field is empty; '' = the one loaded in the app (LM Studio). */
  model: string
  /** Other good models, named in the hint under the model field. */
  altModels?: string[]
  needsKey: boolean
  /** «Отримати ключ» for cloud providers, the download page for local apps. */
  keyUrl: string | null
  /** Runs on this computer: nothing leaves it, so no warning before sending a record. */
  local: boolean
  /** Local apps: what to do when they don't answer («запустіть Ollama і спробуйте ще раз»). */
  startHint?: string
  cost: string
  privacy: string
  /** OpenAI's reasoning models reject `max_tokens`; everyone else (Mistral is strict) wants `max_tokens`. */
  maxTokensField?: 'max_tokens' | 'max_completion_tokens'
}

export const AI_PRESETS: readonly AiPreset[] = [
  {
    id: 'gemini',
    name: 'Google Gemini — безкоштовно',
    short: 'Google Gemini',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-3.1-flash-lite',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    local: false,
    cost: '$0 · до ~500 запитів на день',
    privacy: 'на безкоштовному рівні Google навчається на ваших текстах'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter — безкоштовні моделі',
    short: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/settings/keys',
    local: false,
    cost: '$0 · 50 запитів на день на моделях :free',
    privacy: 'частина безкоштовних провайдерів зберігає запити'
  },
  {
    id: 'groq',
    name: 'Groq — безкоштовно, швидко',
    short: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-20b',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    local: false,
    cost: '$0 у межах лімітів консолі, далі ≈ $0,3–1,2 на місяць',
    privacy: 'не зберігає запити й не навчається на них'
  },
  {
    id: 'ollama',
    name: 'Ollama — на цьому комп’ютері',
    short: 'Ollama',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen3.5:9b',
    altModels: ['gemma4:12b'],
    needsKey: false,
    keyUrl: 'https://ollama.com/download',
    local: true,
    startHint: 'запустіть Ollama і спробуйте ще раз',
    cost: '$0 · без лімітів · потрібно ~16 ГБ пам’яті',
    privacy: 'нічого не йде в інтернет'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio — на цьому комп’ютері',
    short: 'LM Studio',
    protocol: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    model: '',
    needsKey: false,
    keyUrl: 'https://lmstudio.ai/download',
    local: true,
    startHint: 'запустіть LM Studio, увімкніть у ньому сервер і спробуйте ще раз',
    cost: '$0 · без лімітів · потрібно ~16 ГБ пам’яті',
    privacy: 'нічого не йде в інтернет'
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    short: 'Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-haiku-5-5',
    altModels: ['claude-sonnet-5-5'],
    needsKey: true,
    keyUrl: 'https://platform.claude.com/settings/keys',
    local: false,
    cost: 'Haiku 5.5 ≈ $0,5–1 на місяць · Sonnet 5.5 ≈ $10–18',
    privacy: 'не навчається на запитах API'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    short: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6-luna',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    local: false,
    cost: '≈ $0,3–0,9 на місяць',
    privacy: 'не навчається на запитах API',
    maxTokensField: 'max_completion_tokens'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    short: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    local: false,
    cost: '≈ $0,7–2,4 на місяць, поза піковими годинами вдвічі дешевше',
    privacy: 'дані зберігаються в Китаї'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    short: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    needsKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    local: false,
    cost: '≈ $0,5–1,2 на місяць',
    privacy: 'навчання на ваших текстах вимикається в налаштуваннях Mistral'
  },
  {
    id: 'custom',
    name: 'Своя адреса (OpenAI-сумісна)',
    short: 'сервіс',
    protocol: 'openai',
    baseUrl: '',
    model: '',
    needsKey: false,
    keyUrl: null,
    local: false,
    startHint: 'перевірте адресу й чи запущено сервіс',
    cost: 'залежить від сервісу',
    privacy: 'залежить від сервісу'
  }
]

export function aiPreset(id: AiPresetId): AiPreset {
  return AI_PRESETS.find((p) => p.id === id) ?? AI_PRESETS[0]
}

/** An address on this computer: «Своя адреса» to a local server needs no warning before sending a record. */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return (
      host === 'localhost' || host === '::1' || host.endsWith('.localhost') || /^127\./.test(host)
    )
  } catch {
    return false
  }
}

/* ───────────── Settings (config.json, outside the database) ───────────── */

const HTTP_URL = /^https?:\/\/[^\s/?#]+[^\s]*$/i

export const aiSettingsSchema = z.object({
  /** Off by default: nothing is sent anywhere until the person switches it on. */
  enabled: z.boolean().default(false),
  /** The simplest free option first (план.md, п. 13). */
  preset: z.enum(AI_PRESET_IDS).default('gemini'),
  /** Address of «Своя адреса»; the other presets carry their own. */
  baseUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !v || HTTP_URL.test(v), 'Адреса має починатися з http:// або https://')
    .default(''),
  /** Empty = the preset's recommended model. Cleared when the provider changes. */
  model: z.string().trim().max(120).default(''),
  /** Requests a day: a cap on spending (and on a runaway loop). */
  dailyLimit: z.number().int().min(1).max(5000).default(100),
  /** Cloud presets the person allowed to receive record texts (asked once per provider). */
  consented: z.array(z.enum(AI_PRESET_IDS)).max(AI_PRESET_IDS.length).default([])
})
export type AiSettings = z.infer<typeof aiSettingsSchema>
export const DEFAULT_AI_SETTINGS: AiSettings = aiSettingsSchema.parse({})

/** What the settings screen may change; consent is given only by the warning before the first request. */
export const aiConfigSchema = aiSettingsSchema.omit({ consented: true })
export const aiConfigPatchSchema = patchOf(aiConfigSchema)
export type AiConfigPatch = z.infer<typeof aiConfigPatchSchema>

export const aiKeySchema = z.object({ key: z.string().trim().min(1).max(500) })

/** Today's requests and tokens (resets at local midnight). */
export const aiUsageSchema = z.object({
  day: z.string().max(10),
  requests: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0)
})
export type AiUsage = z.infer<typeof aiUsageSchema>

/* ───────────── What main tells the renderer ───────────── */

export interface AiStatus {
  settings: Omit<AiSettings, 'consented'>
  /** Where requests go and with which model (the preset's while the fields are empty; '' = auto). */
  baseUrl: string
  model: string
  local: boolean
  /** Last four characters of the saved key («••••1a2b»); null — no key. The key itself never leaves main. */
  keyHint: string | null
  /** Why requests can't be sent yet, in Ukrainian; null when everything is filled in. */
  missing: string | null
  /** Switched on and nothing missing: features like «Запропонувати мітки» show up. */
  ready: boolean
  /** The record text may go to this provider (always true for local ones). */
  consented: boolean
  usage: { requests: number; inputTokens: number; outputTokens: number; limit: number }
}

export interface AiTestResult {
  model: string
  ms: number
}

/** One «+ мітка» chip: an existing tag (`tagId`) or a new name to create on click. */
export interface AiTagSuggestion {
  name: string
  tagId: string | null
  color: string | null
}

export const aiSuggestTagsSchema = z.object({
  ref: entityRefSchema,
  /** The person has just agreed in the warning that the text goes to this cloud provider. */
  consent: z.boolean().optional()
})
export type AiSuggestTagsInput = z.infer<typeof aiSuggestTagsSchema>
