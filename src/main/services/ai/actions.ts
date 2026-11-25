/**
 * The chat's action vocabulary in main: what each action's card says (label, title, short facts resolved here —
 * board and column, the date) and how «Застосувати» runs it. Records are created through the modules' public
 * API (their own zod schemas, search index, revisions and trash work as for a record made by hand); edits go
 * through the registry (AiRecordWriter). The fields and limits live in shared/domain/ai-actions.ts; a new action
 * = an entry there and one in DEFS here, the chat service has no per-action code.
 */
import type { Api, RecordSnapshot } from '@shared/api'
import type { EntityRef } from '@shared/domain/common'
import {
  AI_ACTIONS,
  EDIT_ACTIONS,
  LOCAL_WHEN,
  type AiAction,
  type AiActionOf,
  type AiActionType
} from '@shared/domain/ai-actions'
import type { AiActionPreview } from '@shared/domain/ai-chat'
import type { EventInput } from '@shared/domain/calendar'
import { CLAUDE_KIND_LABEL } from '@shared/domain/claude'
import { SITUATION_LABEL } from '@shared/domain/freelance'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { fmtWhen } from '@shared/dates'
import { UserError } from '../../core/util'
import type { AiRecordWriter } from './record-writer'

/** The module APIs the actions create records with. */
export type AiActionApi = Pick<
  Api,
  | 'ideas'
  | 'notes'
  | 'snippets'
  | 'cards'
  | 'boards'
  | 'events'
  | 'checklists'
  | 'bookmarks'
  | 'english'
  | 'claude'
  | 'fixes'
  | 'libraries'
  | 'jobs'
  | 'templates'
  | 'redflags'
  | 'cases'
  | 'components'
>

/** Live, not archived boards, most recently used first, and their columns in order. */
export interface AiBoardsLookup {
  list(): { id: string; title: string }[]
  columns(boardId: string): { id: string; title: string }[]
}

export interface AiActionDeps {
  api: AiActionApi
  boards: AiBoardsLookup
  records: AiRecordWriter
}

export interface Prepared {
  preview: AiActionPreview
  /** Why «Застосувати» can't run now, in Ukrainian; null — it can. */
  problem: string | null
}

export interface Applied {
  ref: EntityRef
  title: string
  kind: 'create' | 'edit'
  /** Edits: the record as it was, for «Скасувати». */
  before: RecordSnapshot | null
}

/** Short facts only (board, date, kind): the content itself is previewed from the action by the renderer. */
const FACT_CHARS = 300
const fact = (label: string, value: string): { label: string; value: string }[] =>
  value.trim() ? [{ label, value: value.trim().slice(0, FACT_CHARS) }] : []

/** «2026-11-26» / «2026-11-26T10:00» as a local time; null for a day that doesn't exist (2026-02-31). */
export function parseLocalWhen(text: string): { at: number; allDay: boolean } | null {
  const m = LOCAL_WHEN.exec(text.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const h = m[4] === undefined ? 0 : Number(m[4])
  const mi = m[5] === undefined ? 0 : Number(m[5])
  if (y < 1970 || y > 2200 || h > 23 || mi > 59) return null
  const date = new Date(y, mo - 1, d, h, mi, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return { at: date.getTime(), allDay: m[4] === undefined }
}

const lower = (s: string): string => s.toLocaleLowerCase('uk').trim()

/** By id, then the exact title, then a title that contains the name (any case). */
function pick<T extends { id: string; title: string }>(list: T[], name: string): T | undefined {
  const n = lower(name)
  if (!n) return undefined
  return (
    list.find((x) => x.id === name) ??
    list.find((x) => lower(x.title) === n) ??
    list.find((x) => lower(x.title).includes(n) || n.includes(lower(x.title)))
  )
}

type Ctx = { deps: AiActionDeps; target: EntityRef | null }

interface ActionDef<K extends AiActionType> {
  /** Facts for the card and why it can't be applied; label and title are added by the runner. */
  prepare?(a: AiActionOf<K>, ctx: Ctx): { fields?: { label: string; value: string }[]; problem?: string }
  apply(a: AiActionOf<K>, ctx: Ctx): Promise<Applied>
}

const created = (type: EntityType, id: string, title: string): Applied => ({
  ref: { type, id },
  title,
  kind: 'create',
  before: null
})

/** Where a new card goes: the named board and column, or the latest board and its first column. */
function cardPlace(
  a: AiActionOf<'create_card'>,
  boards: AiBoardsLookup
): {
  board: { id: string; title: string }
  column: { id: string; title: string }
  note: string | null
} | null {
  const list = boards.list()
  if (!list.length) return null
  const named = pick(list, a.board)
  const board = named ?? list[0]
  const columns = boards.columns(board.id)
  if (!columns.length) return null
  const column = pick(columns, a.column) ?? columns[0]
  const note =
    a.board && !named ? `Дошки «${a.board}» немає — картка піде на «${board.title}»` : null
  return { board, column, note }
}

/** An edit of the open record: what it changes, or why it can't. */
function editTarget(
  ctx: Ctx,
  needsText: boolean
): { ref: EntityRef; title: string } | { problem: string } {
  if (!ctx.target)
    return { problem: 'Відкрийте запис і спитайте ще раз — тоді ШІ зможе його змінити' }
  const title = ctx.deps.records.title(ctx.target)
  if (title === null) return { problem: 'Цього запису вже немає або він у кошику' }
  if (needsText && !ctx.deps.records.canAppend(ctx.target))
    return { problem: `До запису типу «${ENTITY_META[ctx.target.type].label}» текст не додати` }
  return { ref: ctx.target, title }
}

async function applyEdit(
  ctx: Ctx,
  needsText: boolean,
  write: (ref: EntityRef) => void
): Promise<Applied> {
  const t = editTarget(ctx, needsText)
  if ('problem' in t) throw new UserError(t.problem)
  const before = ctx.deps.records.snapshot(t.ref)
  write(t.ref)
  return { ref: t.ref, title: t.title, kind: 'edit', before }
}

function eventInput(a: AiActionOf<'create_event'>): EventInput | null {
  const start = parseLocalWhen(a.start)
  if (!start) return null
  const end = a.end ? parseLocalWhen(a.end) : null
  return {
    title: a.title,
    description: a.description,
    startAt: start.at,
    endAt: end && end.at > start.at && !start.allDay ? end.at : null,
    allDay: start.allDay
  }
}

const NO_BOARD = 'Спершу створіть дошку — картці нікуди піти'
const BAD_DATE = 'ШІ вказав дату, якої немає в календарі — змініть її або спитайте ще раз'
/** «Дошка» column names: the last one is where finished cards go. */
const DONE_COLUMN = /готов|зроблен|done|закрит/i

const DEFS: { [K in AiActionType]: ActionDef<K> } = {
  create_idea: {
    apply: async (a, { deps }) => {
      const r = await deps.api.ideas.create({ title: a.title, body: a.body })
      return created('idea', r.id, r.title)
    }
  },
  create_note: {
    prepare: (a) => ({ fields: fact('Тека', a.folder) }),
    apply: async (a, { deps }) => {
      const r = await deps.api.notes.create({ title: a.title, body: a.body, folder: a.folder })
      return created('note', r.id, r.title)
    }
  },
  create_snippet: {
    prepare: (a) => ({ fields: fact('Мова', a.language) }),
    apply: async (a, { deps }) => {
      const r = await deps.api.snippets.create({
        title: a.title,
        code: a.code,
        language: a.language,
        description: a.description
      })
      return created('snippet', r.id, r.title)
    }
  },
  create_card: {
    prepare: (a, { deps }) => {
      const place = cardPlace(a, deps.boards)
      return place
        ? {
            fields: [
              ...fact('Дошка', place.board.title),
              ...fact('Колонка', place.column.title),
              ...(place.note ? fact('Увага', place.note) : [])
            ]
          }
        : { problem: NO_BOARD }
    },
    apply: async (a, { deps }) => {
      const place = cardPlace(a, deps.boards)
      if (!place) throw new UserError(NO_BOARD)
      const card = await deps.api.cards.create({
        boardId: place.board.id,
        columnId: place.column.id,
        title: a.title,
        description: a.description
      })
      for (const text of a.checks) await deps.api.cards.addCheck({ cardId: card.id, text })
      return created('card', card.id, card.title)
    }
  },
  create_event: {
    prepare: (a) => {
      const input = eventInput(a)
      return input
        ? { fields: fact('Коли', fmtWhen(input.startAt, !!input.allDay)) }
        : { problem: BAD_DATE }
    },
    apply: async (a, { deps }) => {
      const input = eventInput(a)
      if (!input) throw new UserError(BAD_DATE)
      const r = await deps.api.events.create(input)
      return created('event', r.id, r.title)
    }
  },
  create_checklist: {
    apply: async (a, { deps }) => {
      // The import the «Чек-листи» page uses: one template with its sections and items, in one transaction.
      const r = await deps.api.checklists.importTemplate({
        title: a.title,
        description: a.description,
        sections: a.sections
      })
      return created('checklist', r.id, r.title)
    }
  },
  create_bookmark: {
    apply: async (a, { deps }) => {
      const r = await deps.api.bookmarks.create({
        title: a.title,
        url: a.url,
        notes: a.notes,
        kind: a.kind
      })
      return created('bookmark', r.id, r.title)
    }
  },
  create_word: {
    apply: async (a, { deps }) => {
      const r = await deps.api.english.create({
        term: a.term,
        translation: a.translation,
        kind: a.kind,
        transcription: a.transcription,
        example: a.example,
        exampleTranslation: a.exampleTranslation,
        notes: a.notes
      })
      return created('word', r.id, r.term)
    }
  },
  create_claude: {
    prepare: (a) => ({ fields: fact('Вид', CLAUDE_KIND_LABEL[a.kind]) }),
    apply: async (a, { deps }) => {
      const r = await deps.api.claude.create({
        kind: a.kind,
        title: a.title,
        summary: a.summary,
        content: a.content
      })
      return created('claude', r.id, r.title)
    }
  },
  create_fix: {
    prepare: (a) => ({ fields: fact('Де', a.context) }),
    apply: async (a, { deps }) => {
      const r = await deps.api.fixes.create({
        title: a.title,
        errorText: a.errorText,
        cause: a.cause,
        solution: a.solution,
        context: a.context
      })
      return created('fix', r.id, r.title)
    }
  },
  create_library: {
    apply: async (a, { deps }) => {
      const r = await deps.api.libraries.create({
        name: a.name,
        purpose: a.purpose,
        notes: a.notes,
        npmUrl: a.npmUrl,
        githubUrl: a.githubUrl,
        docsUrl: a.docsUrl,
        installCmd: a.installCmd,
        status: a.status
      })
      return created('library', r.id, r.name)
    }
  },
  create_question: {
    prepare: (a) => ({ fields: fact('Тема', a.topic) }),
    apply: async (a, { deps }) => {
      const r = await deps.api.jobs.createQuestion({
        question: a.question,
        answer: a.answer,
        topic: a.topic,
        category: a.category,
        lang: a.lang,
        difficulty: a.difficulty
      })
      return created('question', r.id, r.question)
    }
  },
  create_template: {
    prepare: (a) => ({ fields: fact('Ситуація', SITUATION_LABEL[a.situation]) }),
    apply: async (a, { deps }) => {
      const r = await deps.api.templates.create({
        title: a.title,
        situation: a.situation,
        trigger: a.trigger,
        body: a.body,
        note: a.note,
        niche: a.niche
      })
      return created('template', r.id, r.title)
    }
  },
  create_redflag: {
    apply: async (a, { deps }) => {
      const r = await deps.api.redflags.create({
        title: a.title,
        signs: a.signs,
        action: a.action,
        severity: a.severity
      })
      return created('redflag', r.id, r.title)
    }
  },
  create_case: {
    prepare: (a) => ({ fields: [...fact('Клієнт', a.client), ...fact('Стек', a.stack)] }),
    apply: async (a, { deps }) => {
      const r = await deps.api.cases.create({
        title: a.title,
        niche: a.niche,
        client: a.client,
        problem: a.problem,
        whatDone: a.whatDone,
        result: a.result,
        stack: a.stack,
        url: a.url,
        textEn: a.textEn
      })
      return created('case', r.id, r.title)
    }
  },
  create_component: {
    prepare: (a) => ({ fields: fact('Мова', a.language) }),
    apply: async (a, { deps }) => {
      const r = await deps.api.components.create({
        title: a.title,
        description: a.description,
        code: a.code,
        language: a.language
      })
      return created('component', r.id, r.title)
    }
  },
  create_board: {
    apply: async (a, { deps }) => {
      const board = await deps.api.boards.create({ title: a.title, description: a.description })
      if (a.columns.length) {
        // A new board comes with the four default columns: rename them in place, add or remove the rest.
        const details = await deps.api.boards.details(board.id)
        const existing = details?.columns ?? []
        for (const [i, title] of a.columns.entries()) {
          const isDone = i === a.columns.length - 1 && (a.columns.length > 1 || DONE_COLUMN.test(title))
          const col = existing[i]
          if (col) await deps.api.boards.updateColumn({ id: col.id, patch: { title, isDone } })
          else await deps.api.boards.addColumn({ boardId: board.id, input: { title, isDone } })
        }
        for (const col of existing.slice(a.columns.length))
          await deps.api.boards.removeColumn({ id: col.id, moveCardsTo: null })
      }
      return created('board', board.id, board.title)
    }
  },
  append_text: {
    prepare: (_a, ctx) => {
      const t = editTarget(ctx, true)
      return 'problem' in t ? { problem: t.problem } : {}
    },
    apply: (a, ctx) => applyEdit(ctx, true, (ref) => ctx.deps.records.appendText(ref, a.text))
  },
  add_tags: {
    prepare: (_a, ctx) => {
      const t = editTarget(ctx, false)
      return 'problem' in t ? { problem: t.problem } : {}
    },
    apply: (a, ctx) => applyEdit(ctx, false, (ref) => ctx.deps.records.addTags(ref, a.tags))
  }
}

/** «Створити: чек-лист», «Додати текст: Нотатка «План»» — what the card does, for its label. */
function labelOf(type: AiActionType, where: string): string {
  if (type === 'append_text') return `Додати текст: ${where}`
  if (type === 'add_tags') return `Додати мітки: ${where}`
  return `Створити: ${ENTITY_META[AI_ACTIONS[type].entity].label.toLocaleLowerCase('uk')}`
}

/** The title an action shows: its title field, or the record it changes. */
function titleOf(action: AiAction, targetTitle: string): string {
  if (EDIT_ACTIONS.has(action.type)) return targetTitle
  const v = (action as Record<string, unknown>)[AI_ACTIONS[action.type].titleKey]
  return typeof v === 'string' ? v : ''
}

/** Runs the vocabulary above; `target` is the record the person had open as the context of the request. */
export class AiActionRunner {
  constructor(private readonly deps: AiActionDeps) {}

  private def(a: AiAction): ActionDef<AiActionType> {
    return DEFS[a.type] as unknown as ActionDef<AiActionType>
  }

  prepare(action: AiAction, target: EntityRef | null): Prepared {
    const ctx = { deps: this.deps, target }
    const edit = EDIT_ACTIONS.has(action.type)
    const t = edit ? editTarget(ctx, action.type === 'append_text') : null
    const live = t && 'ref' in t ? t : null
    const out = this.def(action).prepare?.(action as never, ctx) ?? {}
    const where = live ? `${ENTITY_META[live.ref.type].label} «${live.title}»` : ''
    return {
      preview: {
        label: labelOf(action.type, where),
        type: edit ? (target?.type ?? 'note') : AI_ACTIONS[action.type].entity,
        title: titleOf(action, live?.title ?? '').slice(0, 500),
        fields: (out.fields ?? []).slice(0, 8),
        target: live?.ref ?? null
      },
      problem: out.problem ?? null
    }
  }

  async apply(action: AiAction, target: EntityRef | null): Promise<Applied> {
    const done = await this.def(action).apply(action as never, { deps: this.deps, target })
    // A new record under a default title («Нова нотатка») with no text is not an empty draft to clean up.
    if (done.kind === 'create') this.deps.records.keep(done.ref)
    return done
  }

  /** «Скасувати» in the toast: a new record goes for good, an edited one is rolled back. */
  undo(done: Applied): void {
    if (done.kind === 'create') {
      if (!this.deps.records.discardNew(done.ref))
        throw new UserError('Запис уже змінено або видалено — приберіть його вручну')
      return
    }
    if (done.before) this.deps.records.revert(done.ref, done.before)
  }
}
