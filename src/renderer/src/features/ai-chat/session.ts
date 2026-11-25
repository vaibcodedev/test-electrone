import { create } from 'zustand'
import { toast } from 'sonner'
import type { AiActionEdits } from '@shared/domain/ai-actions'
import type { AiActionRef, AiChat } from '@shared/domain/ai-chat'
import type { RawEdits } from './action-text'
import type { EntityRef } from '@shared/domain/common'
import type { EntityType } from '@shared/entity-types'
import { api, ApiError } from '@/lib/api'
import { invalidateAll, queryClient } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { fmtTitle } from '@/lib/format'

/** One question on its way: shown in the thread until the answer replaces it. */
export interface Outgoing {
  text: string
  context: EntityRef | null
  search: boolean
  /** The page the question was asked on (route + query): «додай сюди» means its section. */
  page?: string
}

/**
 * The chat panel's state for the session, outside React (the panel unmounts when closed, the draft and a
 * request in flight survive it). Server data — the chat itself, the list — lives in TanStack Query.
 */
interface ChatSession {
  chatId: string | null
  draft: string
  search: boolean
  /** The context chip removed for this record (`type:id`); another record brings it back. */
  hiddenContext: string | null
  pending: Outgoing | null
  failure: (Outgoing & { message: string }) | null
  /** «Зупинити» was pressed: the cancelled request returns its text to the composer instead of an error. */
  stopping: boolean
  /** Actions with a request in flight («Застосувати», «Скасувати»). */
  busy: Record<string, true>
  /** A question waiting for «Надіслати» in the warning before the first cloud request with record texts. */
  consent: Outgoing | null
  /** «Змінити»: raw text of the edited fields per action, kept until «Застосувати» (closing the panel keeps it). */
  edits: Record<string, RawEdits>
}

export const useChatSession = create<ChatSession>(() => ({
  chatId: null,
  draft: '',
  search: false,
  hiddenContext: null,
  pending: null,
  failure: null,
  stopping: false,
  busy: {},
  consent: null,
  edits: {}
}))

export function setEdit(actionId: string, key: string, value: string): void {
  useChatSession.setState((s) => ({
    edits: { ...s.edits, [actionId]: { ...s.edits[actionId], [key]: value } }
  }))
}

export function dropEdits(actionId: string): void {
  useChatSession.setState((s) => {
    const edits = { ...s.edits }
    delete edits[actionId]
    return { edits }
  })
}

const chatKey = (id: string): unknown[] => ['aiChat', 'get', id]

function putChat(chat: AiChat): void {
  queryClient.setQueryData(chatKey(chat.id), chat)
  void queryClient.invalidateQueries({ queryKey: ['aiChat', 'list'] })
}

const message = (e: unknown): string =>
  e instanceof Error ? e.message : 'Не вдалося отримати відповідь. Спробуйте ще раз.'

/**
 * Sends a question. Not a useApiMutation on purpose: a chat message changes nothing in the base, so the whole
 * app doesn't refetch on every answer — only the chat and the usage counter do.
 */
export async function sendMessage(out: Outgoing, consent?: boolean): Promise<void> {
  const s = useChatSession.getState()
  if (s.pending) return
  const from = s.chatId
  useChatSession.setState({ pending: out, failure: null, draft: '', stopping: false })
  try {
    const chat = await api.aiChat.send({ chatId: from, ...out, consent })
    putChat(chat)
    // Another chat opened meanwhile stays open; the answer is in its own chat.
    if (useChatSession.getState().chatId === from) useChatSession.setState({ chatId: chat.id })
    useChatSession.setState({ pending: null })
  } catch (e) {
    const stopped = useChatSession.getState().stopping
    useChatSession.setState((st) =>
      stopped
        ? { pending: null, stopping: false, draft: st.draft || out.text }
        : { pending: null, failure: { ...out, message: message(e) } }
    )
    if (!(e instanceof ApiError)) reportError(e, 'ai-chat:send')
  } finally {
    // Today's requests and tokens under the chat title.
    void queryClient.invalidateQueries({ queryKey: ['ai', 'status'] })
  }
}

export function stopMessage(): void {
  if (!useChatSession.getState().pending) return
  useChatSession.setState({ stopping: true })
  void api.ai.cancel()
}

export function newChat(): void {
  useChatSession.setState({ chatId: null, failure: null, hiddenContext: null })
}

export function openChat(id: string): void {
  useChatSession.setState({ chatId: id, failure: null })
}

export async function removeChat(id: string): Promise<void> {
  try {
    await api.aiChat.remove(id)
    if (useChatSession.getState().chatId === id) newChat()
    queryClient.removeQueries({ queryKey: chatKey(id) })
    void queryClient.invalidateQueries({ queryKey: ['aiChat', 'list'] })
    toast.success('Чат видалено')
  } catch (e) {
    toast.error(message(e), { duration: 8000 })
  }
}

const CREATED: Partial<Record<EntityType, string>> = {
  idea: 'Ідею створено',
  note: 'Нотатку створено',
  snippet: 'Сніпет створено',
  card: 'Картку створено',
  event: 'Подію створено'
}

async function withBusy<T>(ref: AiActionRef, run: () => Promise<T>): Promise<T | undefined> {
  if (useChatSession.getState().busy[ref.actionId]) return undefined
  useChatSession.setState((s) => ({ busy: { ...s.busy, [ref.actionId]: true } }))
  try {
    return await run()
  } catch (e) {
    toast.error(message(e), { duration: 8000 })
    if (!(e instanceof ApiError)) reportError(e, 'ai-chat:action')
    return undefined
  } finally {
    useChatSession.setState((s) => {
      const busy = { ...s.busy }
      delete busy[ref.actionId]
      return { busy }
    })
  }
}

/** «Скасувати» in the toast: the new record goes for good, the changed one comes back as it was. */
export async function undoAction(ref: AiActionRef, kind: 'create' | 'edit'): Promise<void> {
  const chat = await withBusy(ref, () => api.aiChat.undo(ref))
  if (!chat) return
  putChat(chat)
  invalidateAll()
  toast.success(kind === 'create' ? 'Створення скасовано' : 'Зміну скасовано')
}

/**
 * «Застосувати»: the record is created or changed (with the edits from «Змінити»), the toast offers «Відкрити» and
 * «Скасувати». True when it was applied.
 */
export async function applyAction(
  ref: AiActionRef,
  open: (ref: EntityRef) => void,
  edits?: AiActionEdits
): Promise<boolean> {
  const done = await withBusy(ref, () => api.aiChat.apply({ ...ref, edits }))
  if (!done) {
    // A refused action may now carry its reason (the board is gone): show it on the card.
    void queryClient.invalidateQueries({ queryKey: chatKey(ref.chatId) })
    return false
  }
  dropEdits(ref.actionId)
  putChat(done.chat)
  invalidateAll()
  toast.success(
    done.kind === 'create' ? (CREATED[done.ref.type] ?? 'Запис створено') : 'Запис змінено',
    {
      description: fmtTitle(done.title),
      action: { label: 'Відкрити', onClick: () => open(done.ref) },
      cancel: { label: 'Скасувати', onClick: () => void undoAction(ref, done.kind) }
    }
  )
  return true
}

export async function dismissAction(ref: AiActionRef): Promise<void> {
  const chat = await withBusy(ref, () => api.aiChat.dismiss(ref))
  if (chat) putChat(chat)
}

/** «Повернути»: the cancelled action is proposed again, with the edits it had. */
export async function reopenAction(ref: AiActionRef): Promise<void> {
  const chat = await withBusy(ref, () => api.aiChat.reopen(ref))
  if (chat) putChat(chat)
}
