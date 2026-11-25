import { UserError } from '../../core/util'
import { log } from '../../core/logger'
import {
  joinUrl,
  type AiAdapter,
  type AiConnection,
  type AiHttp,
  type AiReply,
  type AiRequest
} from './adapter'

/** Messages API version sent in `anthropic-version` (raw HTTP: Vault ships no SDK). */
export const ANTHROPIC_VERSION = '2026-10-21'

interface MessagesResponse {
  model?: string
  content?: { type: string; text?: string }[]
  stop_reason?: string | null
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
}

/**
 * `output_config.effort` is accepted by Claude 5 models and Opus/Sonnet 4.6+; older ones (Haiku 4.5…) answer
 * it with a 400, so a model typed by hand gets no effort at all.
 */
export function supportsEffort(model: string): boolean {
  const m = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?/.exec(model)
  if (!m) return false
  const major = Number(m[2])
  return (
    major >= 5 || (major === 4 && (m[1] === 'opus' || m[1] === 'sonnet') && Number(m[3] ?? 0) >= 6)
  )
}

/** Anthropic Messages API: `POST /v1/messages` with `x-api-key` and `anthropic-version`. */
export class AnthropicAdapter implements AiAdapter {
  constructor(private readonly http: AiHttp) {}

  async complete(conn: AiConnection, req: AiRequest): Promise<AiReply> {
    const body = {
      model: conn.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      ...(req.effort && supportsEffort(conn.model) ? { output_config: { effort: req.effort } } : {})
    }
    const data = await this.http.json<MessagesResponse>(
      conn,
      joinUrl(conn.baseUrl, 'v1/messages'),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': conn.apiKey ?? '',
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify(body)
      },
      req
    )
    // Thinking blocks come first on Claude 5 models; only the text blocks are the answer.
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
    if (data.stop_reason === 'refusal')
      throw new UserError('Claude відмовився відповідати на цей запит')
    if (!text.trim()) {
      log.warn(`[ai] anthropic: empty answer, stop_reason=${data.stop_reason}`)
      throw new UserError('Claude повернув порожню відповідь — спробуйте ще раз')
    }
    const u = data.usage ?? {}
    return {
      text,
      model: data.model ?? conn.model,
      // Cached input is input too: the daily counter shows everything that was sent.
      inputTokens:
        (u.input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0
    }
  }

  async models(): Promise<string[]> {
    return []
  }
}
