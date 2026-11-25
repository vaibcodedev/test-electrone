/**
 * «Чат ШІ»: the chat history, the actions the model may propose and what the renderer sends.
 * The model never writes to the database: it proposes actions from this small vocabulary, main validates them
 * (lengths from the modules' own schemas), and a record changes only after «Застосувати».
 */
import { z } from 'zod'
import { entityRefSchema, idSchema, type EntityRef } from './common'
import { fieldMax, MAX } from './limits'
import { ideaInputSchema } from './ideas'
import { noteInputSchema } from './notes'
import { SNIPPET_LANGUAGES, snippetInputSchema } from './snippets'
import { cardInputSchema } from './boards'
import { eventInputSchema } from './calendar'
import { tagInputSchema } from './system'

/* ───────────── Actions ───────────── */

export const AI_ACTION_TYPES = [
  'create_idea',
  'create_note',
  'create_snippet',
  'create_card',
  'create_event',
  'append_text',
  'add_tags'
] as const
export type AiActionType = (typeof AI_ACTION_TYPES)[number]

const title = z.string().trim().min(1).max(MAX.title)
const text = (max: number): z.ZodDefault<z.ZodString> => z.string().max(max).default('')
/** A local day or a local day and time, as the model writes it: 2026-11-26 or 2026-11-26T10:00. */
export const LOCAL_WHEN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/
const when = z.string().trim().regex(LOCAL_WHEN)
/** One «Додати текст» may not be a whole book: the record keeps its own, larger limit. */
export const APPEND_MAX = 20_000
export const TAGS_MAX = 10

/**
 * What the model may propose. Field names are the JSON the model writes (system prompt in main), limits are the
 * target modules' own: an action that passes here can't fail the module's validation on length.
 */
export const aiActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_idea'),
    title,
    body: text(fieldMax(ideaInputSchema.shape.body))
  }),
  z.object({
    type: z.literal('create_note'),
    title,
    body: text(fieldMax(noteInputSchema.shape.body)),
    folder: z.string().trim().max(fieldMax(noteInputSchema.shape.folder)).default('')
  }),
  z.object({
    type: z.literal('create_snippet'),
    title,
    code: text(fieldMax(snippetInputSchema.shape.code)),
    // A language the list doesn't know («python») is still a snippet: plain text.
    language: z.enum(SNIPPET_LANGUAGES).catch('text').default('text'),
    description: text(fieldMax(snippetInputSchema.shape.description))
  }),
  z.object({
    type: z.literal('create_card'),
    title,
    description: text(fieldMax(cardInputSchema.shape.description)),
    /** Board title (or id); empty — the board used most recently. */
    board: z.string().trim().max(MAX.title).default(''),
    /** Column title; empty — the board's first column. */
    column: z.string().trim().max(MAX.label).default('')
  }),
  z.object({
    type: z.literal('create_event'),
    title,
    description: text(fieldMax(eventInputSchema.shape.description)),
    start: when,
    end: when.optional()
  }),
  z.object({
    type: z.literal('append_text'),
    text: z.string().trim().min(1).max(APPEND_MAX)
  }),
  z.object({
    type: z.literal('add_tags'),
    tags: z
      .array(z.string().trim().min(1).max(fieldMax(tagInputSchema.shape.name)))
      .min(1)
      .max(TAGS_MAX)
  })
])
export type AiAction = z.infer<typeof aiActionSchema>

/** Actions that change the record open as the context, not create a new one. */
export const EDIT_ACTIONS: ReadonlySet<AiActionType> = new Set(['append_text', 'add_tags'])

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

const proposalSchema = z.object({
  id: idSchema,
  action: aiActionSchema,
  preview: previewSchema,
  status: z.enum(AI_ACTION_STATUSES),
  /** Why it can't be applied now (no boards, the record is gone); «Застосувати» is off. */
  problem: z.string().max(300).nullable(),
  /** After «Застосувати»: the record created or changed. */
  result: z.object({ ref: entityRefSchema, title: z.string().max(MAX.title) }).nullable()
})
export type AiActionProposal = z.infer<typeof proposalSchema>

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
  actions: z.array(proposalSchema).max(10).default([]),
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
  /** «Шукати в моїй базі». */
  search: z.boolean().default(false),
  /** The person has just agreed that record texts go to this cloud provider. */
  consent: z.boolean().optional()
})
export type AiChatSendInput = z.input<typeof aiChatSendSchema>

export const aiActionRefSchema = z.object({
  chatId: idSchema,
  messageId: idSchema,
  actionId: idSchema
})
export type AiActionRef = z.infer<typeof aiActionRefSchema>

export interface AiApplyResult {
  ref: EntityRef
  title: string
  /** create — «Скасувати» deletes the new record; edit — rolls the record back. */
  kind: 'create' | 'edit'
  chat: AiChat
}
