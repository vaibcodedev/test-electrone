/**
 * What the chat ШІ may propose: one entry per action — its zod schema (fields and limits taken from the module's
 * own input schema, so an action that passes here can't fail the module on length), the record type it makes,
 * the fields line for the model and the fields «Змінити» edits. Main applies them (services/ai/actions.ts), the
 * renderer previews them; a new action = one entry here + one in main. No money, no deletions.
 */
import { z } from 'zod'
import type { EntityType } from '../entity-types'
import { fieldMax, MAX } from './limits'
import { ideaInputSchema } from './ideas'
import { noteInputSchema } from './notes'
import { SNIPPET_LANGUAGES, snippetInputSchema } from './snippets'
import { boardInputSchema, cardCheckInputSchema, cardInputSchema, columnInputSchema } from './boards'
import { eventInputSchema } from './calendar'
import { checklistImportSchema } from './checklists'
import { bookmarkInputSchema } from './bookmarks'
import { wordInputSchema } from './english'
import { claudeInputSchema } from './claude'
import { fixInputSchema } from './fixes'
import { libraryInputSchema } from './libraries'
import { questionInputSchema } from './jobs'
import { caseInputSchema, redFlagInputSchema, TEMPLATE_SITUATIONS, templateInputSchema } from './freelance'
import { componentInputSchema } from './components'
import { tagInputSchema } from './system'

/** A local day or a local day and time, as the model writes it: 2026-11-26 or 2026-11-26T10:00. */
export const LOCAL_WHEN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/
const when = z.string().trim().regex(LOCAL_WHEN)
/** One «Додати текст» may not be a whole book: the record keeps its own, larger limit. */
export const APPEND_MAX = 20_000
export const TAGS_MAX = 10
/** Columns of a new board, checks of a new card. */
export const COLUMNS_MAX = 12
export const CHECKS_MAX = 30

const type = <T extends string>(t: T): { type: z.ZodLiteral<T> } => ({ type: z.literal(t) })

const createIdea = ideaInputSchema.pick({ title: true, body: true }).extend(type('create_idea'))
const createNote = noteInputSchema
  .pick({ title: true, body: true, folder: true })
  .extend(type('create_note'))
const createSnippet = snippetInputSchema.pick({ title: true, code: true, description: true }).extend({
  ...type('create_snippet'),
  // A language the list doesn't know («python») is still a snippet: plain text.
  language: z.enum(SNIPPET_LANGUAGES).catch('text').default('text')
})
const createCard = cardInputSchema.pick({ title: true, description: true }).extend({
  ...type('create_card'),
  /** Board title (or id); empty — the board used most recently. */
  board: z.string().trim().max(MAX.title).default(''),
  /** Column title; empty — the board's first column. */
  column: z.string().trim().max(MAX.label).default(''),
  checks: z.array(cardCheckInputSchema.shape.text).max(CHECKS_MAX).default([])
})
const createEvent = eventInputSchema.pick({ title: true, description: true }).extend({
  ...type('create_event'),
  start: when,
  end: when.optional()
})
const createChecklist = checklistImportSchema.extend(type('create_checklist'))
const createBookmark = bookmarkInputSchema.pick({ title: true, url: true, notes: true }).extend({
  ...type('create_bookmark'),
  kind: bookmarkInputSchema.shape.kind.catch('article')
})
const createWord = wordInputSchema
  .pick({
    term: true,
    translation: true,
    transcription: true,
    example: true,
    exampleTranslation: true,
    notes: true
  })
  .extend({ ...type('create_word'), kind: wordInputSchema.shape.kind.catch('word') })
const createClaude = claudeInputSchema.pick({ title: true, summary: true, content: true }).extend({
  ...type('create_claude'),
  kind: claudeInputSchema.shape.kind.catch('note')
})
const createFix = fixInputSchema
  .pick({ title: true, errorText: true, cause: true, solution: true, context: true })
  .extend(type('create_fix'))
const createLibrary = libraryInputSchema
  .pick({
    name: true,
    purpose: true,
    notes: true,
    npmUrl: true,
    githubUrl: true,
    docsUrl: true,
    installCmd: true
  })
  .extend({ ...type('create_library'), status: libraryInputSchema.shape.status.catch('want') })
const createQuestion = questionInputSchema
  .pick({ question: true, answer: true, topic: true })
  .extend({
    ...type('create_question'),
    category: questionInputSchema.shape.category.catch('technical'),
    lang: questionInputSchema.shape.lang.catch('uk'),
    difficulty: questionInputSchema.shape.difficulty.catch(2)
  })
const createTemplate = templateInputSchema
  .pick({ title: true, trigger: true, body: true, note: true, niche: true })
  .extend({
    ...type('create_template'),
    situation: z.enum(TEMPLATE_SITUATIONS).catch('other').default('proposal')
  })
const createRedflag = redFlagInputSchema
  .pick({ title: true, signs: true, action: true })
  .extend({ ...type('create_redflag'), severity: redFlagInputSchema.shape.severity.catch(2) })
const createCase = caseInputSchema
  .pick({
    title: true,
    niche: true,
    client: true,
    problem: true,
    whatDone: true,
    result: true,
    stack: true,
    url: true,
    textEn: true
  })
  .extend(type('create_case'))
const createComponent = componentInputSchema
  .pick({ title: true, description: true, code: true })
  .extend({
    ...type('create_component'),
    language: componentInputSchema.shape.language.catch('tsx')
  })
const createBoard = boardInputSchema.pick({ title: true, description: true }).extend({
  ...type('create_board'),
  /** Column titles in order; empty — the default four (Беклог … Готово). The last one is «done». */
  columns: z.array(columnInputSchema.shape.title).max(COLUMNS_MAX).default([])
})
const appendText = z.object({
  ...type('append_text'),
  text: z.string().trim().min(1).max(APPEND_MAX)
})
const addTags = z.object({
  ...type('add_tags'),
  tags: z
    .array(z.string().trim().min(1).max(fieldMax(tagInputSchema.shape.name)))
    .min(1)
    .max(TAGS_MAX)
})

export const aiActionSchema = z.discriminatedUnion('type', [
  createIdea,
  createNote,
  createSnippet,
  createCard,
  createEvent,
  createChecklist,
  createBookmark,
  createWord,
  createClaude,
  createFix,
  createLibrary,
  createQuestion,
  createTemplate,
  createRedflag,
  createCase,
  createComponent,
  createBoard,
  appendText,
  addTags
])
export type AiAction = z.infer<typeof aiActionSchema>
export type AiActionType = AiAction['type']
export type AiActionOf<K extends AiActionType> = Extract<AiAction, { type: K }>

/** Each action's own object schema: edits are checked against it, the renderer reads its limits. */
export const AI_ACTION_SCHEMAS = Object.fromEntries(
  aiActionSchema.options.map((o) => [o.shape.type.value, o])
) as unknown as { [K in AiActionType]: z.ZodObject }

export const AI_ACTION_TYPES = Object.keys(AI_ACTION_SCHEMAS) as AiActionType[]

/** Actions that change the record open as the context, not create a new one. */
export const EDIT_ACTIONS: ReadonlySet<AiActionType> = new Set(['append_text', 'add_tags'])

/**
 * How «Змінити» shows a field: `line` — one line, `text` — plain text, `markdown` — Markdown, `code` — code,
 * `lines` — a list, one item per line, `list` — a list in one line, comma-separated.
 */
export type AiEditInput = 'line' | 'text' | 'markdown' | 'code' | 'lines' | 'list'

export interface AiEditField {
  key: string
  label: string
  input: AiEditInput
  required?: boolean
  placeholder?: string
}

export interface AiActionMeta {
  /** The record it creates (for edits — the open record's type is taken instead). */
  entity: EntityType
  /** The model's fields, for the system prompt. */
  fields: string
  /** What «Змінити» edits, in order (the title first). */
  edit: AiEditField[]
  /** The field shown as the title on the card. */
  titleKey: string
}

const f = (
  key: string,
  label: string,
  input: AiEditInput,
  extra: Partial<AiEditField> = {}
): AiEditField => ({ key, label, input, ...extra })
const TITLE = f('title', 'Назва', 'line', { required: true })

export const AI_ACTIONS: Record<AiActionType, AiActionMeta> = {
  create_idea: {
    entity: 'idea',
    fields: '{title, body: markdown}',
    edit: [TITLE, f('body', 'Текст', 'markdown')],
    titleKey: 'title'
  },
  create_note: {
    entity: 'note',
    fields: '{title, body: markdown, folder?}',
    edit: [TITLE, f('folder', 'Тека', 'line'), f('body', 'Текст', 'markdown')],
    titleKey: 'title'
  },
  create_snippet: {
    entity: 'snippet',
    fields: `{title, code, language: ${SNIPPET_LANGUAGES.join('|')}, description?}`,
    edit: [TITLE, f('description', 'Опис', 'text'), f('code', 'Код', 'code')],
    titleKey: 'title'
  },
  create_card: {
    entity: 'card',
    fields: '{title, description: markdown, board?: board title, column?: column title, checks?: [text]}',
    edit: [
      TITLE,
      f('description', 'Опис', 'markdown'),
      f('checks', 'Підзадачі', 'lines', { placeholder: 'Одна підзадача в рядку' })
    ],
    titleKey: 'title'
  },
  create_event: {
    entity: 'event',
    fields:
      '{title, start: "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" = all day), end?, description?} — local time',
    edit: [
      TITLE,
      f('start', 'Коли', 'line', { required: true, placeholder: 'Напр.: 2026-11-26 10:00' }),
      f('description', 'Опис', 'text')
    ],
    titleKey: 'title'
  },
  create_checklist: {
    entity: 'checklist',
    fields:
      '{title, description?, sections: [{title, items: ["step" | {text, hint}]}]} — a reusable checklist template',
    edit: [TITLE, f('description', 'Опис', 'text')],
    titleKey: 'title'
  },
  create_bookmark: {
    entity: 'bookmark',
    fields: '{title, url, kind: article|video|course|docs|repo|other, notes?: markdown}',
    edit: [TITLE, f('url', 'Посилання', 'line'), f('notes', 'Нотатки', 'markdown')],
    titleKey: 'title'
  },
  create_word: {
    entity: 'word',
    fields:
      '{term: English, translation: Ukrainian, kind: word|phrase|idiom|term, transcription?, example?: English sentence, exampleTranslation?, notes?}',
    edit: [
      f('term', 'Слово або фраза', 'line', { required: true }),
      f('translation', 'Переклад', 'line'),
      f('example', 'Приклад', 'text'),
      f('exampleTranslation', 'Переклад прикладу', 'text')
    ],
    titleKey: 'term'
  },
  create_claude: {
    entity: 'claude',
    fields: '{kind: note|prompt|skill|guide|plugin|branch, title, summary?, content: markdown}',
    edit: [TITLE, f('summary', 'Коротко', 'text'), f('content', 'Текст', 'markdown')],
    titleKey: 'title'
  },
  create_fix: {
    entity: 'fix',
    fields: '{title, errorText?, cause?: markdown, solution: markdown, context?: stack or area}',
    edit: [
      TITLE,
      f('errorText', 'Текст помилки', 'code'),
      f('cause', 'Причина', 'markdown'),
      f('solution', 'Рішення', 'markdown')
    ],
    titleKey: 'title'
  },
  create_library: {
    entity: 'library',
    fields: '{name: npm package, purpose, installCmd?, npmUrl?, githubUrl?, docsUrl?, notes?: markdown}',
    edit: [
      f('name', 'Пакет', 'line', { required: true }),
      f('purpose', 'Для чого', 'text'),
      f('installCmd', 'Встановлення', 'line'),
      f('notes', 'Нотатки', 'markdown')
    ],
    titleKey: 'name'
  },
  create_question: {
    entity: 'question',
    fields:
      '{question, answer: markdown, topic?, category: technical|behavioral|company|salary|other, lang: uk|en|ru, difficulty: 1-3}',
    edit: [
      f('question', 'Питання', 'text', { required: true }),
      f('topic', 'Тема', 'line'),
      f('answer', 'Відповідь', 'markdown')
    ],
    titleKey: 'question'
  },
  create_template: {
    entity: 'template',
    fields: `{title, situation: ${TEMPLATE_SITUATIONS.join('|')}, body: text with {variables}, trigger?: when to use, note?}`,
    edit: [
      TITLE,
      f('trigger', 'Коли використовувати', 'text'),
      f('body', 'Текст', 'text', { placeholder: 'Hi {client}, …' }),
      f('note', 'Нотатка для себе', 'text')
    ],
    titleKey: 'title'
  },
  create_redflag: {
    entity: 'redflag',
    fields: '{title, signs: how to spot it, action: what to do, severity: 1-3}',
    edit: [TITLE, f('signs', 'Ознаки', 'text'), f('action', 'Що робити', 'text')],
    titleKey: 'title'
  },
  create_case: {
    entity: 'case',
    fields: '{title, client?, niche?, problem, whatDone, result, stack?, url?, textEn?: English text for the platform}',
    edit: [
      TITLE,
      f('problem', 'Задача', 'text'),
      f('whatDone', 'Що зроблено', 'text'),
      f('result', 'Результат', 'text')
    ],
    titleKey: 'title'
  },
  create_component: {
    entity: 'component',
    fields: '{title, code: a React component, language: tsx|jsx|html, description?}',
    edit: [TITLE, f('description', 'Опис', 'text'), f('code', 'Код', 'code')],
    titleKey: 'title'
  },
  create_board: {
    entity: 'board',
    fields: '{title, description?, columns?: [column titles, the last one = done]}',
    edit: [
      TITLE,
      f('description', 'Опис', 'text'),
      f('columns', 'Колонки', 'lines', { placeholder: 'Одна колонка в рядку' })
    ],
    titleKey: 'title'
  },
  append_text: {
    entity: 'note',
    fields: '{text: markdown added at the end of the open record}',
    edit: [f('text', 'Текст', 'markdown', { required: true })],
    titleKey: 'text'
  },
  add_tags: {
    entity: 'note',
    fields: '{tags: [tag, tag]} — adds tags to the open record, keeps its own',
    edit: [f('tags', 'Мітки', 'list', { required: true, placeholder: 'Через кому' })],
    titleKey: 'tags'
  }
}

/** «Змінити»: the edited fields of one action, as the renderer sends them (main merges and re-checks). */
export const aiActionEditsSchema = z
  .record(
    z.string().max(40),
    z.union([z.string().max(600_000), z.array(z.string().max(2000)).max(300)])
  )
  .refine((r) => Object.keys(r).length <= 20)
export type AiActionEdits = z.infer<typeof aiActionEditsSchema>

/**
 * The action with the person's edits: only the fields «Змінити» offers for its type, checked by the action's own
 * schema (limits of the module). Throws a ZodError the rpc layer turns into Ukrainian.
 */
export function withEdits(action: AiAction, edits: AiActionEdits | undefined): AiAction {
  if (!edits) return action
  const allowed = new Set(AI_ACTIONS[action.type].edit.map((e) => e.key))
  const patch = Object.fromEntries(Object.entries(edits).filter(([k]) => allowed.has(k)))
  return aiActionSchema.parse({ ...action, ...patch, type: action.type })
}
