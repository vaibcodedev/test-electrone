/**
 * «Чат ШІ»: the chat history, the actions the model may propose and what the renderer sends.
 * The model never writes to the database: it proposes actions from this small vocabulary, main validates them
 * (lengths from the modules' own schemas), and a record changes only after «Застосувати».
 */
import { z } from 'zod'
import { entityRefSchema, idSchema, type EntityRef } from './common'
import { MAX } from './limits'
import { aiActionEditsSchema, aiActionSchema } from './ai-actions'

export {
  AI_ACTION_TYPES,
  APPEND_MAX,
  EDIT_ACTIONS,
  LOCAL_WHEN,
  TAGS_MAX,
  aiActionSchema,
  type AiAction,
  type AiActionType
} from './ai-actions'

export const AI_ACTION_STATUSES = ['proposed', 'applied', 'dismissed'] as const

const previewSchema = z.object({
  /** «Створити ідею», «Додати текст до нотатки». */
  label: z.string().max(200),
  /** Type of the record created or changed (its icon on the card). */
  type: entityRefSchema.shape.type,
  title: z.string().max(MAX.title),
  /** What will be written, label → value (values are already clipped for the card). */
  fields: z.array(z.object({ label: z.string().max(100), value: z.string().max(2000) })).max(8),
  /** Edits: the record that changes. */
  target: entityRefSchema.nullable()
})
export type AiActionPreview = z.infer<typeof previewSchema>

export const aiActionProposalSchema = z.object({
  id: idSchema,
  action: aiActionSchema,
  preview: previewSchema,
  status: z.enum(AI_ACTION_STATUSES),
  /** Why it can't be applied now (no boards, the record is gone); «Застосувати» is off. */
  problem: z.string().max(300).nullable(),
  /** After «Застосувати»: the record created or changed. */
  result: z.object({ ref: entityRefSchema, title: z.string().max(MAX.title) }).nullable()
})
export type AiActionProposal = z.infer<typeof aiActionProposalSchema>

/* ───────────── Chat history ───────────── */

/** One message keeps at most this much text (an answer is never this long; a pasted text may be). */
export const MESSAGE_MAX = 40_000
/** What the person types in one message. */
export const PROMPT_MAX = 8000

const sourceSchema = z.object({
  /** [n] in the answer. */
  n: z.number().int().min(1).max(50),
  ref: entityRefSchema,
  title: z.string().max(MAX.title),
  /** The answer cites it. */
  cited: z.boolean()
})
export type AiSource = z.infer<typeof sourceSchema>

export const aiChatMessageSchema = z.object({
  id: idSchema,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MESSAGE_MAX),
  at: z.number().int().nonnegative(),
  /** User: the record attached as the context chip. */
  context: entityRefSchema.nullable().default(null),
  /** User: «Шукати в моїй базі» was on. */
  searched: z.boolean().default(false),
  /** Assistant: records found in the base and given to the model, in the order of [n]. */
  sources: z.array(sourceSchema).max(20).default([]),
  actions: z.array(aiActionProposalSchema).max(10).default([]),
  /** Assistant: actions the model wrote that failed validation (the card says how many were skipped). */
  skipped: z.number().int().min(0).max(100).default(0),
  model: z.string().max(200).default('')
})
export type AiChatMessage = z.infer<typeof aiChatMessageSchema>

export const aiChatSchema = z.object({
  id: idSchema,
  title: z.string().max(200),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  messages: z.array(aiChatMessageSchema).max(400)
})
export type AiChat = z.infer<typeof aiChatSchema>

export interface AiChatSummary {
  id: string
  title: string
  updatedAt: number
  messages: number
}

/* ───────────── Calls ───────────── */

export const aiChatSendSchema = z.object({
  /** null — a new chat. */
  chatId: idSchema.nullable().default(null),
  text: z.string().trim().min(1).max(PROMPT_MAX),
  /** The context chip: the record open on the page. */
  context: entityRefSchema.nullable().default(null),
  /** Where the person is: the page's route with its query («/checklists», «/notes?open=…»). */
  page: z.string().max(MAX.line).default(''),
  /** «Шукати в моїй базі». */
  search: z.boolean().default(false),
  /** The person has just agreed that record texts go to this cloud provider. */
  consent: z.boolean().optional(),
  /** «Повторити відповідь»: the chat's last question and answer are replaced by the new ones. */
  retry: z.boolean().default(false)
})
export type AiChatSendInput = z.input<typeof aiChatSendSchema>

export const aiActionRefSchema = z.object({
  chatId: idSchema,
  messageId: idSchema,
  actionId: idSchema
})
export type AiActionRef = z.infer<typeof aiActionRefSchema>

/** «Застосувати», maybe after «Змінити»: the edited fields go with the action's id, main checks them again. */
export const aiApplySchema = aiActionRefSchema.extend({ edits: aiActionEditsSchema.optional() })
export type AiApplyInput = z.input<typeof aiApplySchema>

export interface AiApplyResult {
  ref: EntityRef
  title: string
  /** create — «Скасувати» deletes the new record; edit — rolls the record back. */
  kind: 'create' | 'edit'
  chat: AiChat
}
