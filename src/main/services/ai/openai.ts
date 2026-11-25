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

interface ChatResponse {
  model?: string
  choices?: {
    message?: {
      content?: string | { type?: string; text?: string }[] | null
      refusal?: string | null
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

function contentText(
  content: string | { type?: string; text?: string }[] | null | undefined
): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content.map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
  return ''
}

/**
 * OpenAI Chat Completions (`POST {base}/chat/completions`, `Authorization: Bearer`): OpenAI itself, Gemini's
 * OpenAI-compatible address, OpenRouter, Groq, DeepSeek, Mistral, Ollama and LM Studio. Only portable fields
 * are sent — Mistral rejects unknown ones, LM Studio has no `json_object` mode — and the answer format is
 * asked for in the prompt.
 */
export class OpenAiAdapter implements AiAdapter {
  constructor(private readonly http: AiHttp) {}

  private headers(conn: AiConnection): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(conn.apiKey ? { authorization: `Bearer ${conn.apiKey}` } : {})
    }
  }

  async complete(conn: AiConnection, req: AiRequest): Promise<AiReply> {
    const body = {
      model: conn.model,
      messages: [
        { role: 'system', content: req.system },
        ...(req.history ?? []).map((t) => ({ role: t.role, content: t.text })),
        { role: 'user', content: req.prompt }
      ],
      [conn.preset.maxTokensField ?? 'max_tokens']: req.maxTokens
    }
    const data = await this.http.json<ChatResponse>(
      conn,
      joinUrl(conn.baseUrl, 'chat/completions'),
      { method: 'POST', headers: this.headers(conn), body: JSON.stringify(body) },
      req
    )
    const choice = data.choices?.[0]
    const text = contentText(choice?.message?.content)
    const who = conn.preset.short.charAt(0).toUpperCase() + conn.preset.short.slice(1)
    if (!text.trim()) {
      log.warn(`[ai] ${conn.preset.id}: empty answer, finish_reason=${choice?.finish_reason}`)
      if (choice?.message?.refusal)
        throw new UserError(`${who} відмовився відповідати на цей запит`)
      if (choice?.finish_reason === 'length')
        throw new UserError(
          `${who} не встиг відповісти — модель довго міркувала. Спробуйте ще раз або іншу модель`
        )
      throw new UserError(`${who} повернув порожню відповідь — спробуйте ще раз`)
    }
    return {
      text,
      model: data.model ?? conn.model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0
    }
  }

  async models(
    conn: AiConnection,
    req: Pick<AiRequest, 'timeoutMs' | 'signal'>
  ): Promise<string[]> {
    const data = await this.http.json<{ data?: { id?: unknown }[] }>(
      conn,
      joinUrl(conn.baseUrl, 'models'),
      { method: 'GET', headers: this.headers(conn) },
      req
    )
    return (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && !!id)
  }
}
