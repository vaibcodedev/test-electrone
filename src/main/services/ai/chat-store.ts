import { readFileSync, renameSync, writeFileSync } from 'fs'
import {
  aiActionProposalSchema,
  aiChatSchema,
  type AiChat,
  type AiChatSummary
} from '@shared/domain/ai-chat'
import { log } from '../../core/logger'
import { retryBusy } from '../../core/util'

/** The most recent chats kept; older ones go when a new one starts. */
export const CHATS_MAX = 50
/** Messages kept per chat (the oldest go first); the model sees far fewer anyway. */
export const CHAT_MESSAGES_MAX = 200

/** A stored chat with the actions that fail today's schema left out (everything else is checked as usual). */
function withoutBadActions(raw: unknown): unknown {
  const chat = raw as { messages?: unknown }
  if (!chat || typeof chat !== 'object' || !Array.isArray(chat.messages)) return raw
  return {
    ...chat,
    messages: chat.messages.map((m: unknown) => {
      const msg = m as { actions?: unknown }
      if (!msg || typeof msg !== 'object' || !Array.isArray(msg.actions)) return m
      return {
        ...msg,
        actions: msg.actions.filter((a) => aiActionProposalSchema.safeParse(a).success)
      }
    })
  }
}

/** The slice of ChatStore the chat service needs (a memory store in unit tests). */
export interface AiChatHistory {
  list(): AiChatSummary[]
  get(id: string): AiChat | null
  save(chat: AiChat): void
  remove(id: string): void
}

/**
 * Chat history in its own JSON file next to config.json (`ai-chats.json`), on this computer only: not in the
 * database, so it never goes into backups, exports or the sync of the base. A separate file, not config.json:
 * the history grows to hundreds of kilobytes, config.json is rewritten on every window move.
 * Read on first use; writes are debounced and atomic (temp file + rename); a broken file starts an empty history.
 */
export class ChatStore implements AiChatHistory {
  private chats: AiChat[] | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly file: string) {}

  private load(): AiChat[] {
    if (this.chats) return this.chats
    let raw: unknown
    try {
      raw = JSON.parse(retryBusy(() => readFileSync(this.file, 'utf8'), 2))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        log.warn('[ai] chat history unreadable, starting empty', (e as Error).message)
      return (this.chats = [])
    }
    const list = Array.isArray((raw as { chats?: unknown })?.chats)
      ? ((raw as { chats: unknown[] }).chats ?? [])
      : []
    // One damaged chat (hand edit, an older format) is dropped alone, not the whole history; an action that no
    // longer fits its module's limits (a lowered limit) is dropped from its message, the chat stays.
    const chats = list.flatMap((c) => {
      const parsed = aiChatSchema.safeParse(c) as { success: boolean; data?: AiChat }
      const ok = parsed.success ? parsed : aiChatSchema.safeParse(withoutBadActions(c))
      return ok.success && ok.data ? [ok.data] : []
    })
    if (chats.length < list.length)
      log.warn(`[ai] ${list.length - chats.length} chats dropped as invalid`)
    return (this.chats = chats.sort((a, b) => b.updatedAt - a.updatedAt))
  }

  list(): AiChatSummary[] {
    return this.load().map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messages: c.messages.length
    }))
  }

  get(id: string): AiChat | null {
    const chat = this.load().find((c) => c.id === id)
    return chat ? structuredClone(chat) : null
  }

  save(chat: AiChat): void {
    const kept = { ...chat, messages: chat.messages.slice(-CHAT_MESSAGES_MAX) }
    const rest = this.load().filter((c) => c.id !== chat.id)
    this.chats = [structuredClone(kept), ...rest]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CHATS_MAX)
    this.schedule()
  }

  remove(id: string): void {
    this.chats = this.load().filter((c) => c.id !== id)
    this.schedule()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 300)
  }

  /** Writes pending changes now (on quit). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.chats) return
    try {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: 1, chats: this.chats }))
      renameSync(tmp, this.file)
    } catch (e) {
      // Sizes only: the history itself is the person's text.
      log.error(`[ai] chat history not saved (${this.chats.length} chats)`, (e as Error).message)
    }
  }
}
