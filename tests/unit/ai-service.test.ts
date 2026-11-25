/** AiService: settings, key masking, daily limit, consent before a cloud request; config.json compatibility. */
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  AI_PRESETS,
  aiConfigPatchSchema,
  aiSettingsSchema,
  DEFAULT_AI_SETTINGS,
  isLocalUrl,
  type AiSettings,
  type AiUsage
} from '@shared/domain/ai'
import { AiService, type AiStore } from '@main/services/ai'
import { AiOverloadedError, AiAdapter, AiReply } from '@main/services/ai/adapter'
import { ConfigStore } from '@main/core/config-store'
import { UserError } from '@main/core/util'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

class MemoryStore implements AiStore {
  aiSettings: AiSettings = structuredClone(DEFAULT_AI_SETTINGS)
  aiUsage: AiUsage = { day: '', requests: 0, inputTokens: 0, outputTokens: 0 }
  secrets: Record<string, string> = {}
  updateAiSettings(next: AiSettings): void {
    this.aiSettings = aiSettingsSchema.parse(next)
  }
  secret(key: string): string | null {
    return this.secrets[key] ?? null
  }
  setSecret(key: string, value: string | null): void {
    if (value) this.secrets[key] = value
    else delete this.secrets[key]
  }
}

const secrets = {
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, '')
}

function setup(reply: Partial<AiReply> = {}): {
  ai: AiService
  store: MemoryStore
  complete: ReturnType<typeof vi.fn<AiAdapter['complete']>>
} {
  const store = new MemoryStore()
  const complete = vi.fn<AiAdapter['complete']>(async () => ({
    text: '{"tags":["react","Нова"]}',
    model: 'm',
    inputTokens: 10,
    outputTokens: 2,
    ...reply
  }))
  const adapter: AiAdapter = { complete, models: vi.fn(async () => ['loaded-model']) }
  const ai = new AiService({
    store,
    secrets,
    adapters: { anthropic: adapter, openai: adapter },
    records: {
      text: (ref) => (ref.id === 'gone' ? null : { title: 'Хуки React', body: 'useEffect' }),
      tagsOf: () => [],
      allTags: () => [{ id: 't1', name: 'React', color: null, createdAt: 0, usage: 3 }]
    },
    now: () => new Date(2026, 10, 25, 12).getTime()
  })
  return { ai, store, complete }
}

const reason = async (p: Promise<unknown>): Promise<string> => {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  )
  expect(e).toBeInstanceOf(UserError)
  return (e as Error).message
}

describe('AI settings schema', () => {
  it('off by default, Gemini first, every preset is well-formed', () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      enabled: false,
      preset: 'gemini',
      baseUrl: '',
      model: '',
      dailyLimit: 100,
      consented: []
    })
    for (const p of AI_PRESETS) {
      if (p.id === 'custom') expect(p.baseUrl).toBe('')
      else expect(p.baseUrl).toMatch(p.local ? /^http:\/\/localhost:\d+\/v1$/ : /^https:\/\//)
      if (p.needsKey) expect(p.keyUrl).toMatch(/^https:\/\//)
      expect(p.cost).toBeTruthy()
      expect(p.privacy || p.id === 'custom').toBeTruthy()
    }
  })

  it('a patch touches only its own fields (patchOf: no defaults inside)', () => {
    expect(aiConfigPatchSchema.parse({ model: 'x' })).toEqual({ model: 'x' })
    expect(() => aiConfigPatchSchema.parse({ baseUrl: 'ftp://x' })).toThrow()
    expect(() => aiConfigPatchSchema.parse({ dailyLimit: 0 })).toThrow()
  })

  it('knows addresses on this computer', () => {
    expect(isLocalUrl('http://localhost:8080/v1')).toBe(true)
    expect(isLocalUrl('http://127.0.0.1:9/v1')).toBe(true)
    expect(isLocalUrl('https://api.example.com/v1')).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
  })

  it('an older config.json without the section reads as the defaults; a bad value resets only itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-ai-'))
    const old = join(dir, 'old.json')
    writeFileSync(old, JSON.stringify({ settings: { userName: 'Олена' } }))
    expect(new ConfigStore(old).aiSettings).toEqual(DEFAULT_AI_SETTINGS)
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, JSON.stringify({ ai: { enabled: true, preset: 'nope', dailyLimit: 20 } }))
    const cfg = new ConfigStore(bad)
    expect(cfg.aiSettings).toMatchObject({ enabled: true, preset: 'gemini', dailyLimit: 20 })
    expect(cfg.settings.userName).toBe('')
  })
})

describe('AiService', () => {
  it('the key never reaches the status — only its last four characters', async () => {
    const { ai } = setup()
    expect(ai.status().missing).toBe('Додайте ключ Google Gemini')
    const status = ai.setKey({ key: '  AIzaSyTEST1a2b ' })
    expect(status.keyHint).toBe('1a2b')
    expect(JSON.stringify(status)).not.toContain('AIzaSyTEST')
    expect(status.ready).toBe(false) // still switched off
    expect(ai.setConfig({ enabled: true }).ready).toBe(true)
    expect(ai.clearKey().keyHint).toBeNull()
  })

  it('each provider keeps its own key; a new provider starts from its recommended model', () => {
    const { ai } = setup()
    ai.setKey({ key: 'gemini-key-0001' })
    ai.setConfig({ model: 'gemini-3.5-flash-lite' })
    const groq = ai.setConfig({ preset: 'groq' })
    expect(groq.keyHint).toBeNull()
    expect(groq.model).toBe('openai/gpt-oss-20b')
    expect(ai.setConfig({ preset: 'gemini' }).keyHint).toBe('0001')
  })

  it('local providers need no key and no consent', async () => {
    const { ai, complete } = setup()
    const status = ai.setConfig({ enabled: true, preset: 'ollama' })
    expect(status).toMatchObject({ ready: true, local: true, consented: true, missing: null })
    await expect(ai.suggestTags({ ref: { type: 'idea', id: 'i1' } })).resolves.toHaveLength(2)
    expect(complete.mock.calls[0][0]).toMatchObject({
      apiKey: null,
      baseUrl: 'http://localhost:11434/v1'
    })
  })

  it('LM Studio without a model takes the one it has loaded', async () => {
    const { ai, complete } = setup()
    ai.setConfig({ preset: 'lmstudio' })
    await ai.test()
    expect(complete.mock.calls[0][0]).toMatchObject({ model: 'loaded-model' })
  })

  it('a cloud provider asks once before the record text goes to it', async () => {
    const { ai, complete } = setup()
    ai.setKey({ key: 'gemini-key-0001' })
    ai.setConfig({ enabled: true })
    expect(ai.status().consented).toBe(false)
    expect(await reason(ai.suggestTags({ ref: { type: 'idea', id: 'i1' } }))).toBe(
      'Спершу підтвердьте, що текст запису можна надіслати Google Gemini'
    )
    expect(complete).not.toHaveBeenCalled()
    const chips = await ai.suggestTags({ ref: { type: 'idea', id: 'i1' }, consent: true })
    expect(chips).toEqual([
      { name: 'React', tagId: 't1', color: null },
      { name: 'Нова', tagId: null, color: null }
    ])
    expect(ai.status().consented).toBe(true)
    await ai.suggestTags({ ref: { type: 'idea', id: 'i1' } })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('counts today’s requests and tokens and stops at the daily limit', async () => {
    const { ai, store } = setup()
    ai.setConfig({ preset: 'ollama', enabled: true, dailyLimit: 2 })
    await ai.test()
    await ai.test()
    expect(ai.status().usage).toEqual({ requests: 2, inputTokens: 20, outputTokens: 4, limit: 2 })
    expect(await reason(ai.test())).toMatch(/^Денний ліміт вичерпано: 2 з 2 запитів/)
    // A new day starts from zero.
    store.aiUsage = { ...store.aiUsage, day: '2026-11-24' }
    expect(ai.status().usage.requests).toBe(0)
  })

  it('switched off, an empty record, a missing record — plain reasons', async () => {
    const { ai } = setup()
    ai.setConfig({ preset: 'ollama' })
    expect(await reason(ai.suggestTags({ ref: { type: 'idea', id: 'i1' } }))).toMatch(
      /^Штучний інтелект вимкнено/
    )
    ai.setConfig({ enabled: true })
    await expect(ai.suggestTags({ ref: { type: 'idea', id: 'gone' } })).rejects.toThrow(
      /запис не знайдено/
    )
  })

  it('«Своя адреса» needs an address; localhost counts as local', () => {
    const { ai } = setup()
    expect(ai.setConfig({ preset: 'custom' }).missing).toBe('Вкажіть адресу сервісу')
    expect(ai.setConfig({ baseUrl: 'https://llm.example.com/v1' }).missing).toBe('Вкажіть модель')
    const local = ai.setConfig({ baseUrl: 'http://127.0.0.1:8080/v1' })
    expect(local).toMatchObject({ missing: null, local: true })
  })

  it('a key with spaces inside is refused; «Bearer » is stripped', () => {
    const { ai, store } = setup()
    expect(() => ai.setKey({ key: 'two words' })).toThrow(UserError)
    ai.setKey({ key: 'Bearer sk-abcdef12' })
    expect(store.secrets['ai:gemini']).toBe('enc:sk-abcdef12')
  })
})

describe('overloaded provider', () => {
  it('tries the preset spare model once while the model field is empty', async () => {
    const { ai, complete } = setup()
    ai.setKey({ key: 'gemini-key-0001' })
    ai.setConfig({ enabled: true })
    complete.mockRejectedValueOnce(
      new AiOverloadedError('Google Gemini зараз перевантажений — спробуйте за хвилину')
    )
    await ai.test()
    expect(complete.mock.calls.map(([c]) => c.model)).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite'
    ])
  })

  it('never swaps a model the person chose', async () => {
    const { ai, complete } = setup()
    ai.setKey({ key: 'gemini-key-0001' })
    ai.setConfig({ enabled: true, model: 'gemini-3.8-flash' })
    complete.mockRejectedValueOnce(
      new AiOverloadedError('Google Gemini зараз перевантажений — спробуйте за хвилину')
    )
    expect(await reason(ai.test())).toBe(
      'Google Gemini зараз перевантажений — спробуйте за хвилину'
    )
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
