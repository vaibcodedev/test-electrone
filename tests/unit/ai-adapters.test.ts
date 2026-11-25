/** AI adapters over a stubbed fetch: request shape, usage, and every failure in plain Ukrainian. */
import { describe, expect, it, vi } from 'vitest'
import { aiPreset, type AiPresetId } from '@shared/domain/ai'
import { AiHttp, type AiConnection, type FetchFn } from '@main/services/ai/adapter'
import { AnthropicAdapter, ANTHROPIC_VERSION, supportsEffort } from '@main/services/ai/anthropic'
import { OpenAiAdapter } from '@main/services/ai/openai'
import { UserError } from '@main/core/util'

vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const conn = (id: AiPresetId, over: Partial<AiConnection> = {}): AiConnection => {
  const preset = aiPreset(id)
  return {
    preset,
    baseUrl: preset.baseUrl,
    apiKey: 'sk-test-1234',
    model: preset.model,
    local: preset.local,
    ...over
  }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

/** A fetch stub that answers in turn and remembers what was sent. */
function stub(
  ...answers: (Response | Error | 'hang')[]
): FetchFn & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = answers.shift()
    if (next === 'hang' || next === undefined) return new Promise<Response>(() => undefined)
    if (next instanceof Error) throw next
    return next
  }) as FetchFn & { calls: typeof calls }
  fn.calls = calls
  return fn
}

const noSleep = async (): Promise<void> => undefined
const req = { system: 'sys', prompt: 'hello', maxTokens: 100, timeoutMs: 1000 }

const chat = (content: string): Record<string, unknown> => ({
  model: 'gemini-3.5-flash-lite',
  choices: [{ message: { content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 3 }
})

async function message(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  )
  expect(e).toBeInstanceOf(UserError)
  return (e as Error).message
}

describe('OpenAI-compatible adapter', () => {
  it('sends a Chat Completions request with Bearer and reads the text and usage', async () => {
    const fetch = stub(json(200, chat('{"tags":["shopify"]}')))
    const reply = await new OpenAiAdapter(new AiHttp(fetch, noSleep)).complete(conn('gemini'), req)
    expect(reply).toEqual({
      text: '{"tags":["shopify"]}',
      model: 'gemini-3.5-flash-lite',
      inputTokens: 12,
      outputTokens: 3
    })
    expect(fetch.calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    )
    const headers = fetch.calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test-1234')
    const body = JSON.parse(String(fetch.calls[0].init.body))
    expect(body).toEqual({
      model: 'gemini-3.5-flash-lite',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' }
      ],
      max_tokens: 100
    })
  })

  it('OpenAI itself gets max_completion_tokens; a local app gets no Authorization', async () => {
    const fetch = stub(json(200, chat('ok')), json(200, chat('ok')))
    const adapter = new OpenAiAdapter(new AiHttp(fetch, noSleep))
    await adapter.complete(conn('openai'), req)
    expect(JSON.parse(String(fetch.calls[0].init.body)).max_completion_tokens).toBe(100)
    await adapter.complete(conn('ollama', { apiKey: null }), req)
    expect(fetch.calls[1].url).toBe('http://localhost:11434/v1/chat/completions')
    expect((fetch.calls[1].init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('401 — the key does not fit', async () => {
    const fetch = stub(json(401, { error: { message: 'Incorrect API key provided' } }))
    expect(
      await message(new OpenAiAdapter(new AiHttp(fetch, noSleep)).complete(conn('groq'), req))
    ).toBe('Ключ не підходить — Groq його не прийняв. Перевірте ключ або створіть новий')
  })

  it('Gemini answers a wrong key with 400 «API key not valid» — same message', async () => {
    const fetch = stub(
      json(400, [{ error: { message: 'API key not valid. Please pass a valid API key.' } }])
    )
    const text = await message(
      new OpenAiAdapter(new AiHttp(fetch, noSleep)).complete(conn('gemini'), req)
    )
    expect(text).toMatch(/^Ключ не підходить — Google Gemini/)
  })

  it('429 — the limit is used up, with the wait from retry-after; no retry', async () => {
    const fetch = stub(
      json(429, { error: { message: 'Rate limit reached' } }, { 'retry-after': '20' })
    )
    const text = await message(
      new OpenAiAdapter(new AiHttp(fetch, noSleep)).complete(conn('openrouter'), req)
    )
    expect(text).toBe('Ліміт запитів OpenRouter вичерпано — спробуйте за 20 с')
    expect(fetch.calls).toHaveLength(1)
  })

  it('an overloaded server is retried twice (2 s, 5 s), then explained', async () => {
    const fetch = stub(json(503, {}), json(503, {}), json(503, {}))
    const waits: number[] = []
    const text = await message(
      new OpenAiAdapter(new AiHttp(fetch, async (ms) => void waits.push(ms))).complete(
        conn('mistral'),
        req
      )
    )
    expect(text).toBe('Mistral зараз перевантажений — спробуйте за хвилину')
    expect(fetch.calls).toHaveLength(3)
    expect(waits).toEqual([2000, 5000])
  })

  it('another server error is retried once', async () => {
    const fetch = stub(json(500, {}), json(500, {}))
    const text = await message(
      new OpenAiAdapter(new AiHttp(fetch, noSleep)).complete(conn('mistral'), req)
    )
    expect(text).toBe('Mistral не відповів (код 500) — спробуйте пізніше')
    expect(fetch.calls).toHaveLength(2)
  })

  it('timeout — the server did not answer in time', async () => {
    const fetch = stub('hang')
    const text = await message(
      new OpenAiAdapter(new AiHttp(fetch, noSleep)).complete(conn('deepseek'), {
        ...req,
        timeoutMs: 20
      })
    )
    expect(text).toBe('DeepSeek не відповів за 1 с — спробуйте ще раз')
  })

  it('Ollama not running — start it; cloud without network — check the internet', async () => {
    const refused = new TypeError('net::ERR_CONNECTION_REFUSED')
    const local = await message(
      new OpenAiAdapter(new AiHttp(stub(refused), noSleep)).complete(
        conn('ollama', { apiKey: null }),
        req
      )
    )
    expect(local).toBe('Ollama не відповідає — запустіть Ollama і спробуйте ще раз')
    const cloud = await message(
      new OpenAiAdapter(new AiHttp(stub(refused), noSleep)).complete(conn('groq'), req)
    )
    expect(cloud).toBe('Немає зв’язку з Groq — перевірте інтернет')
  })

  it('a model Ollama does not have — how to install it', async () => {
    const fetch = stub(json(404, { error: { message: "model 'qwen3.5:9b' not found" } }))
    const text = await message(
      new OpenAiAdapter(new AiHttp(fetch, noSleep)).complete(conn('ollama', { apiKey: null }), req)
    )
    expect(text).toContain('ollama pull qwen3.5:9b')
  })

  it('cancel aborts the request', async () => {
    const controller = new AbortController()
    const pending = new OpenAiAdapter(new AiHttp(stub('hang'), noSleep)).complete(conn('groq'), {
      ...req,
      signal: controller.signal
    })
    controller.abort()
    expect(await message(pending)).toBe('Запит скасовано')
  })

  it('lists the models a local server offers (LM Studio)', async () => {
    const fetch = stub(json(200, { data: [{ id: 'qwen3.5-9b' }, { id: 'gemma-4-12b' }] }))
    const models = await new OpenAiAdapter(new AiHttp(fetch, noSleep)).models(
      conn('lmstudio', { apiKey: null }),
      req
    )
    expect(models).toEqual(['qwen3.5-9b', 'gemma-4-12b'])
    expect(fetch.calls[0].url).toBe('http://localhost:1234/v1/models')
  })
})

describe('Anthropic adapter', () => {
  it('lists the models of the key («Модель» in the settings)', async () => {
    const fetch = stub(
      json(200, { data: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }, { id: 7 }] })
    )
    const models = await new AnthropicAdapter(new AiHttp(fetch, noSleep)).models(
      conn('anthropic', { apiKey: 'sk-ant-test' }),
      req
    )
    expect(models).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5'])
    expect(fetch.calls[0].url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    const headers = fetch.calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
  })

  const answer = {
    model: 'claude-haiku-5-5',
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: '{"tags":["react"]}' }
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 40, output_tokens: 9, cache_read_input_tokens: 10 }
  }

  it('sends x-api-key and anthropic-version, low effort; reads only the text blocks', async () => {
    const fetch = stub(json(200, answer))
    const reply = await new AnthropicAdapter(new AiHttp(fetch, noSleep)).complete(
      conn('anthropic'),
      {
        ...req,
        effort: 'low'
      }
    )
    expect(reply).toEqual({
      text: '{"tags":["react"]}',
      model: 'claude-haiku-5-5',
      inputTokens: 50,
      outputTokens: 9
    })
    expect(fetch.calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    const headers = fetch.calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test-1234')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    const body = JSON.parse(String(fetch.calls[0].init.body))
    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 100,
      system: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      output_config: { effort: 'low' }
    })
    expect(body.temperature).toBeUndefined()
  })

  it('effort only for models that take it', () => {
    expect(supportsEffort('claude-haiku-5-5')).toBe(true)
    expect(supportsEffort('claude-sonnet-5-5')).toBe(true)
    expect(supportsEffort('claude-sonnet-4-6')).toBe(true)
    expect(supportsEffort('claude-haiku-4-5')).toBe(false)
    expect(supportsEffort('gpt-6-luna')).toBe(false)
  })

  it('401, 429 and 529 in plain words', async () => {
    const http = (r: Response, again?: Response): AiHttp =>
      new AiHttp(stub(r, ...(again ? [again] : [])), noSleep)
    const err = (type: string): Record<string, unknown> => ({
      type: 'error',
      error: { type, message: type }
    })
    expect(
      await message(
        new AnthropicAdapter(http(json(401, err('authentication_error')))).complete(
          conn('anthropic'),
          req
        )
      )
    ).toBe('Ключ не підходить — Claude його не прийняв. Перевірте ключ або створіть новий')
    expect(
      await message(
        new AnthropicAdapter(http(json(429, err('rate_limit_error')))).complete(
          conn('anthropic'),
          req
        )
      )
    ).toBe('Ліміт запитів Claude вичерпано — спробуйте пізніше')
    expect(
      await message(
        new AnthropicAdapter(
          new AiHttp(
            stub(
              json(529, err('overloaded_error')),
              json(529, err('overloaded_error')),
              json(529, err('overloaded_error'))
            ),
            noSleep
          )
        ).complete(conn('anthropic'), req)
      )
    ).toBe('Claude зараз перевантажений — спробуйте за хвилину')
  })

  it('a refusal is said so instead of an empty answer', async () => {
    const fetch = stub(json(200, { ...answer, content: [], stop_reason: 'refusal' }))
    expect(
      await message(
        new AnthropicAdapter(new AiHttp(fetch, noSleep)).complete(conn('anthropic'), req)
      )
    ).toBe('Claude відмовився відповідати на цей запит')
  })
})
