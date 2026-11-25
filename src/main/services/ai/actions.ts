/**
 * The chat's action vocabulary: what each action shows on its card (preview) and how «Застосувати» runs it.
 * Records are created through the modules' public API (their own zod schemas, search index, revisions and trash
 * work as for a record made by hand); edits go through the registry (AiRecordWriter). A new action = one more
 * entry in DEFS, the chat service has no per-action code.
 */
import type { Api, RecordSnapshot } from '@shared/api'
import type { EntityRef } from '@shared/domain/common'
import {
  EDIT_ACTIONS,
  LOCAL_WHEN,
  type AiAction,
  type AiActionPreview,
  type AiActionType
} from '@shared/domain/ai-chat'
import type { EventInput } from '@shared/domain/calendar'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { fmtWhen } from '@shared/dates'
import { UserError } from '../../core/util'
import type { AiRecordWriter } from './record-writer'

/** The module APIs the actions create records with. */
export type AiActionApi = Pick<Api, 'ideas' | 'notes' | 'snippets' | 'cards' | 'events'>

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

/** A value on the card: long text is cut, the record gets all of it. */
const PREVIEW_CHARS = 600
const clip = (s: string): string =>
  s.length > PREVIEW_CHARS ? `${s.slice(0, PREVIEW_CHARS).trimEnd()}…` : s
const field = (label: string, value: string): { label: string; value: string }[] =>
  value.trim() ? [{ label, value: clip(value.trim()) }] : []

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

type Of<K extends AiActionType> = Extract<AiAction, { type: K }>
type Ctx = { deps: AiActionDeps; target: EntityRef | null }

interface ActionDef<K extends AiActionType> {
  prepare(a: Of<K>, ctx: Ctx): Prepared
  apply(a: Of<K>, ctx: Ctx): Promise<Applied>
}

const created = (type: EntityType, r: { id: string; title: string }): Applied => ({
  ref: { type, id: r.id },
  title: r.title,
  kind: 'create',
  before: null
})

/** Where a new card goes: the named board and column, or the latest board and its first column. */
function cardPlace(
  a: Of<'create_card'>,
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

function editPreview(
  label: string,
  ctx: Ctx,
  fields: { label: string; value: string }[],
  needsText: boolean
): Prepared {
  const t = editTarget(ctx, needsText)
  const target = ctx.target
  return {
    preview: {
      label,
      type: target?.type ?? 'note',
      title: 'ref' in t ? t.title : '',
      fields,
      target: 'ref' in t ? t.ref : null
    },
    problem: 'problem' in t ? t.problem : null
  }
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

function eventInput(a: Of<'create_event'>): EventInput | null {
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

const DEFS: { [K in AiActionType]: ActionDef<K> } = {
  create_idea: {
    prepare: (a) => ({
      preview: {
        label: 'Створити ідею',
        type: 'idea',
        title: a.title,
        fields: field('Текст', a.body),
        target: null
      },
      problem: null
    }),
    apply: async (a, { deps }) =>
      created('idea', await deps.api.ideas.create({ title: a.title, body: a.body }))
  },
  create_note: {
    prepare: (a) => ({
      preview: {
        label: 'Створити нотатку',
        type: 'note',
        title: a.title,
        fields: [...field('Тека', a.folder), ...field('Текст', a.body)],
        target: null
      },
      problem: null
    }),
    apply: async (a, { deps }) =>
      created(
        'note',
        await deps.api.notes.create({ title: a.title, body: a.body, folder: a.folder })
      )
  },
  create_snippet: {
    prepare: (a) => ({
      preview: {
        label: 'Створити сніпет',
        type: 'snippet',
        title: a.title,
        fields: [
          ...field('Мова', a.language),
          ...field('Опис', a.description),
          ...field('Код', a.code)
        ],
        target: null
      },
      problem: null
    }),
    apply: async (a, { deps }) =>
      created(
        'snippet',
        await deps.api.snippets.create({
          title: a.title,
          code: a.code,
          language: a.language,
          description: a.description
        })
      )
  },
  create_card: {
    prepare: (a, { deps }) => {
      const place = cardPlace(a, deps.boards)
      return {
        preview: {
          label: 'Створити картку',
          type: 'card',
          title: a.title,
          fields: place
            ? [
                ...field('Дошка', place.note ?? place.board.title),
                ...field('Колонка', place.column.title),
                ...field('Опис', a.description)
              ]
            : field('Опис', a.description),
          target: null
        },
        problem: place ? null : 'Спершу створіть дошку — картці нікуди піти'
      }
    },
    apply: async (a, { deps }) => {
      const place = cardPlace(a, deps.boards)
      if (!place) throw new UserError('Спершу створіть дошку — картці нікуди піти')
      return created(
        'card',
        await deps.api.cards.create({
          boardId: place.board.id,
          columnId: place.column.id,
          title: a.title,
          description: a.description
        })
      )
    }
  },
  create_event: {
    prepare: (a) => {
      const input = eventInput(a)
      return {
        preview: {
          label: 'Створити подію',
          type: 'event',
          title: a.title,
          fields: [
            ...(input ? field('Коли', fmtWhen(input.startAt, !!input.allDay)) : []),
            ...field('Опис', a.description)
          ],
          target: null
        },
        problem: input ? null : 'ШІ вказав дату, якої немає в календарі — спитайте ще раз'
      }
    },
    apply: async (a, { deps }) => {
      const input = eventInput(a)
      if (!input) throw new UserError('ШІ вказав дату, якої немає в календарі — спитайте ще раз')
      return created('event', await deps.api.events.create(input))
    }
  },
  append_text: {
    prepare: (a, ctx) => editPreview('Додати текст у запис', ctx, field('Текст', a.text), true),
    apply: (a, ctx) => applyEdit(ctx, true, (ref) => ctx.deps.records.appendText(ref, a.text))
  },
  add_tags: {
    prepare: (a, ctx) =>
      editPreview('Додати мітки до запису', ctx, field('Мітки', a.tags.join(', ')), false),
    apply: (a, ctx) => applyEdit(ctx, false, (ref) => ctx.deps.records.addTags(ref, a.tags))
  }
}

/** Runs the vocabulary above; `target` is the record the person had open as the context of the request. */
export class AiActionRunner {
  constructor(private readonly deps: AiActionDeps) {}

  private def(a: AiAction): ActionDef<AiActionType> {
    return DEFS[a.type] as unknown as ActionDef<AiActionType>
  }

  prepare(action: AiAction, target: EntityRef | null): Prepared {
    return this.def(action).prepare(action as never, { deps: this.deps, target })
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

  static isEdit(action: AiAction): boolean {
    return EDIT_ACTIONS.has(action.type)
  }
}
