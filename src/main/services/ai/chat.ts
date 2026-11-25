import type { AiChatApi } from '@shared/api'
import { withEdits } from '@shared/domain/ai-actions'
import {
  aiActionRefSchema,
  aiApplySchema,
  aiChatSendSchema,
  type AiActionProposal,
  type AiActionRef,
  type AiApplyInput,
  type AiApplyResult,
  type AiChat,
  type AiChatMessage,
  type AiChatSendInput,
  type AiSource
} from '@shared/domain/ai-chat'
import { idSchema, type EntityRef } from '@shared/domain/common'
import { MAX } from '@shared/domain/limits'
import type { EntityType } from '@shared/entity-types'
import { newId, now as clock, UserError } from '../../core/util'
import { log } from '../../core/logger'
import type { AiReply, AiRequest } from './adapter'
import type { AiChatHistory } from './chat-store'
import { AiActionRunner, type Applied } from './actions'
import {
  chatPrompt,
  chatSystem,
  chatTitle,
  historyTurns,
  keywords,
  linkCitations,
  parseChatReply,
  recordBlock,
  SOURCES_MAX,
  sourcesBlock,
  type ChatRecord
} from './chat-prompt'

/** AiService as the chat sees it: one request with its checks, limit and usage. */
export interface AiRequester {
  request(
    req: Omit<AiRequest, 'timeoutMs' | 'signal'>,
    opts: { recordText: boolean; consent?: boolean }
  ): Promise<AiReply>
}

/** The base as the chat reads it (container wires the registry and the search index). */
export interface AiChatBase {
  /** Title and text of a live record (the text the search indexes); null when it's gone or in the trash. */
  record(ref: EntityRef): ChatRecord | null
  /** Live records matching the words, best first: all the words, or — `any` — one of them. */
  search(words: string[], opts: { any: boolean; limit: number }): EntityRef[]
  /** Titles of the live boards, most recent first (the model picks a board for a card by name). */
  boards(): string[]
}

export interface AiChatDeps {
  ai: AiRequester
  history: AiChatHistory
  base: AiChatBase
  actions: AiActionRunner
  /** Tells every window a record of this type changed (EventBus). */
  changed: (type: EntityType) => void
  now?: () => number
}

/** Room for a reasoning model's thinking before a long answer. */
const MAX_TOKENS = 4096

/**
 * «Чат ШІ»: builds the request (the open record, the records found in the base, earlier turns), keeps the
 * history and the actions the model proposes. Nothing changes in the base until «Застосувати» (`apply`), and
 * only actions the model really proposed in this chat can be applied — the renderer names one, never sends one.
 * The log gets ids and sizes only, never the texts.
 */
export class AiChatService {
  private readonly now: () => number
  /** What «Скасувати» needs, per applied action, for this session. */
  private readonly undoable = new Map<string, Applied>()
  /** Actions being applied right now: a double click never creates two records. */
  private readonly applying = new Set<string>()

  constructor(private readonly deps: AiChatDeps) {
    this.now = deps.now ?? clock
  }

  /** Records found for the question: every word first, then any of them; live records only. */
  private find(question: string): ChatRecord[] {
    const words = keywords(question)
    if (!words.length) return []
    const refs = this.deps.base.search(words, { any: false, limit: SOURCES_MAX })
    if (refs.length < 3) {
      const seen = new Set(refs.map((r) => `${r.type}:${r.id}`))
      for (const r of this.deps.base.search(words, { any: true, limit: SOURCES_MAX * 2 })) {
        if (!seen.has(`${r.type}:${r.id}`)) refs.push(r)
        seen.add(`${r.type}:${r.id}`)
      }
    }
    return refs
      .slice(0, SOURCES_MAX)
      .map((r) => this.deps.base.record(r))
      .filter((r): r is ChatRecord => !!r)
  }

  async send(input: AiChatSendInput): Promise<AiChat> {
    const { chatId, text, context, search, consent, page } = aiChatSendSchema.parse(input)
    const existing = chatId ? this.deps.history.get(chatId) : null
    if (chatId && !existing) throw new UserError('Цього чату вже немає — почніть новий')
    const at = this.now()
    const record = context ? this.deps.base.record(context) : null
    const found = search ? this.find(text) : null
    const block = found ? sourcesBlock(found) : null
    const reply = await this.deps.ai.request(
      {
        system: chatSystem({
          now: at,
          boards: this.deps.base.boards().slice(0, 20),
          contextType: record?.ref.type ?? null,
          page
        }),
        history: historyTurns(existing?.messages ?? []),
        prompt: chatPrompt({
          record: record ? recordBlock(record) : null,
          sources: block?.text ?? null,
          question: text
        }),
        maxTokens: MAX_TOKENS,
        effort: 'medium'
      },
      { recordText: !!record || !!found?.length, consent }
    )
    const parsed = parseChatReply(reply.text)
    const linked = linkCitations(parsed.text, block?.sources ?? [])
    const target = record?.ref ?? null
    const actions: AiActionProposal[] = parsed.actions.map((action) => {
      const { preview, problem } = this.deps.actions.prepare(action, target)
      return { id: newId(), action, preview, status: 'proposed', problem, result: null }
    })
    if (!linked.text && !actions.length && !parsed.skipped)
      throw new UserError('ШІ повернув порожню відповідь — спробуйте ще раз')
    const question: AiChatMessage = {
      id: newId(),
      role: 'user',
      text,
      at,
      context: record ? record.ref : null,
      searched: search,
      sources: [],
      actions: [],
      skipped: 0,
      model: ''
    }
    const answer: AiChatMessage = {
      id: newId(),
      role: 'assistant',
      text: linked.text.slice(0, 40_000),
      at: this.now(),
      context: null,
      searched: false,
      sources: linked.sources as AiSource[],
      actions,
      skipped: parsed.skipped,
      model: reply.model.slice(0, 200)
    }
    const chat: AiChat = existing
      ? { ...existing, updatedAt: answer.at, messages: [...existing.messages, question, answer] }
      : {
          id: newId(),
          title: chatTitle(text),
          createdAt: at,
          updatedAt: answer.at,
          messages: [question, answer]
        }
    this.deps.history.save(chat)
    log.info(
      `[ai] chat ${chat.id}: ${text.length} → ${answer.text.length} chars, ${found?.length ?? 0} sources, ${actions.length} actions${parsed.skipped ? `, ${parsed.skipped} skipped` : ''}`
    )
    return chat
  }

  private locate(ref: AiActionRef): {
    chat: AiChat
    message: AiChatMessage
    proposal: AiActionProposal
    target: EntityRef | null
  } {
    const chat = this.deps.history.get(ref.chatId)
    if (!chat) throw new UserError('Цього чату вже немає')
    const i = chat.messages.findIndex((m) => m.id === ref.messageId)
    const message = chat.messages[i]
    const proposal = message?.actions.find((a) => a.id === ref.actionId)
    if (!message || !proposal) throw new UserError('Цієї дії вже немає в чаті')
    // The record the person had open when they asked: the only one an edit may touch.
    const asked = chat.messages
      .slice(0, i)
      .reverse()
      .find((m) => m.role === 'user')
    return { chat, message, proposal, target: asked?.context ?? null }
  }

  private update(chat: AiChat, ref: AiActionRef, patch: Partial<AiActionProposal>): AiChat {
    const next: AiChat = {
      ...chat,
      messages: chat.messages.map((m) =>
        m.id !== ref.messageId
          ? m
          : {
              ...m,
              actions: m.actions.map((a) => (a.id === ref.actionId ? { ...a, ...patch } : a))
            }
      )
    }
    this.deps.history.save(next)
    return next
  }

  async apply(input: AiApplyInput): Promise<AiApplyResult> {
    const { edits, ...ref } = aiApplySchema.parse(input)
    const { chat, proposal, target } = this.locate(ref)
    if (proposal.status === 'applied' || this.applying.has(ref.actionId))
      throw new UserError('Цю дію вже застосовано')
    // «Змінити»: only the fields the card offers, checked by the action's own schema (the module's limits).
    const action = withEdits(proposal.action, edits)
    // Checked again: the board or the record may be gone since the answer came.
    const fresh = this.deps.actions.prepare(action, target)
    if (fresh.problem) {
      this.update(chat, ref, { problem: fresh.problem, preview: fresh.preview })
      throw new UserError(fresh.problem)
    }
    this.applying.add(ref.actionId)
    let done: Applied
    try {
      done = await this.deps.actions.apply(action, target)
    } finally {
      this.applying.delete(ref.actionId)
    }
    this.undoable.set(ref.actionId, done)
    this.deps.changed(done.ref.type)
    log.info(
      `[ai] chat ${chat.id}: applied ${proposal.action.type} → ${done.ref.type} ${done.ref.id}`
    )
    // The chat keeps what was really applied: the edited version.
    const next = this.update(chat, ref, {
      action,
      preview: fresh.preview,
      status: 'applied',
      problem: null,
      result: { ref: done.ref, title: done.title.slice(0, MAX.title) }
    })
    return { ref: done.ref, title: done.title, kind: done.kind, chat: next }
  }

  async undo(input: AiActionRef): Promise<AiChat> {
    const ref = aiActionRefSchema.parse(input)
    const { chat, proposal } = this.locate(ref)
    const done = this.undoable.get(ref.actionId)
    if (proposal.status !== 'applied' || !done)
      throw new UserError('Цю дію вже не скасувати — змініть запис вручну')
    this.deps.actions.undo(done)
    this.undoable.delete(ref.actionId)
    this.deps.changed(done.ref.type)
    log.info(`[ai] chat ${chat.id}: undid ${proposal.action.type}`)
    return this.update(chat, ref, { status: 'proposed', result: null })
  }

  async dismiss(input: AiActionRef): Promise<AiChat> {
    const ref = aiActionRefSchema.parse(input)
    const { chat, proposal } = this.locate(ref)
    if (proposal.status === 'applied') return chat
    return this.update(chat, ref, { status: 'dismissed' })
  }

  /** «Повернути» after «Скасувати»: the action is proposed again (checked again on «Застосувати»). */
  async reopen(input: AiActionRef): Promise<AiChat> {
    const ref = aiActionRefSchema.parse(input)
    const { chat, proposal } = this.locate(ref)
    if (proposal.status !== 'dismissed') return chat
    return this.update(chat, ref, { status: 'proposed' })
  }

  api(): AiChatApi {
    return {
      list: async () => this.deps.history.list(),
      get: async (id) => this.deps.history.get(idSchema.parse(id)),
      remove: async (id) => this.deps.history.remove(idSchema.parse(id)),
      send: (input) => this.send(input),
      apply: (ref) => this.apply(ref),
      undo: (ref) => this.undo(ref),
      dismiss: (ref) => this.dismiss(ref),
      reopen: (ref) => this.reopen(ref)
    }
  }
}
