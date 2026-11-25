/**
 * What a chat action looks like in words — the card's summary and teaser — and the person's edits from «Змінити»
 * (raw text while typing, fields main receives on «Застосувати»). Pure: no React.
 */
import {
  AI_ACTIONS,
  parseLocalWhen,
  type AiAction,
  type AiActionEdits,
  type AiActionOf,
  type AiActionType,
  type AiEditField
} from '@shared/domain/ai-actions'
import type { AiActionPreview } from '@shared/domain/ai-chat'
import { CLAUDE_KIND_LABEL } from '@shared/domain/claude'
import { SITUATION_LABEL } from '@shared/domain/freelance'
import { fmtDayFull, fmtDayTime, fmtNumber, hostOf, mdPreview, plural } from '@/lib/format'

/* ───────────── The person's edits («Змінити») ───────────── */

/** Raw text of the edited fields, as typed: a list field stays text until it is sent (blank lines while typing). */
export type RawEdits = Record<string, string>

export const isList = (f: AiEditField): boolean => f.input === 'lines' || f.input === 'list'

/** A field's text in the editor: lists one per line (or comma-separated), the rest as they are. */
export function rawOf(action: AiAction, f: AiEditField): string {
  const v = (action as Record<string, unknown>)[f.key]
  if (Array.isArray(v)) return v.join(f.input === 'list' ? ', ' : '\n')
  return typeof v === 'string' ? v : ''
}

/** Raw edits → the fields main receives (lists split into items, empty items dropped). */
export function toEdits(type: AiActionType, raw: RawEdits | undefined): AiActionEdits | undefined {
  if (!raw || !Object.keys(raw).length) return undefined
  const out: AiActionEdits = {}
  for (const f of AI_ACTIONS[type].edit) {
    if (!(f.key in raw)) continue
    const text = raw[f.key]
    out[f.key] = isList(f)
      ? text
          .split(f.input === 'list' ? ',' : '\n')
          .map((x) => x.trim())
          .filter(Boolean)
      : text
  }
  return out
}

/** The action as it will be applied: the model's version with the person's edits on top. */
export function withRaw(action: AiAction, raw: RawEdits | undefined): AiAction {
  const edits = toEdits(action.type, raw)
  return edits ? ({ ...action, ...edits } as AiAction) : action
}

/** Why «Застосувати» is off: a required field left empty («Заповніть «Назва»»). */
export function missingField(action: AiAction): string | null {
  for (const f of AI_ACTIONS[action.type].edit) {
    if (!f.required) continue
    const v = (action as Record<string, unknown>)[f.key]
    const empty = Array.isArray(v) ? !v.length : !String(v ?? '').trim()
    if (empty) return `Заповніть «${f.label}»`
  }
  return null
}

/* ───────────── Short facts ───────────── */

const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length
const count = (n: number, forms: [string, string, string]): string =>
  `${fmtNumber(n)} ${plural(n, forms)}`
const WORDS: [string, string, string] = ['слово', 'слова', 'слів']
const fact = (preview: AiActionPreview, label: string): string =>
  preview.fields.find((f) => f.label === label)?.value ?? ''

/** «Подія · 26 листопада о 10:00»: when an event starts, in the app's date words. */
export function whenOf(a: AiActionOf<'create_event'>): string {
  const w = parseLocalWhen(a.start)
  if (!w) return 'дата незрозуміла'
  return w.allDay ? `${fmtDayFull(w.at)}, весь день` : fmtDayTime(w.at)
}

const itemText = (it: string | { text: string }): string => (typeof it === 'string' ? it : it.text)

function checklistItems(a: AiActionOf<'create_checklist'>): string[] {
  return a.sections.flatMap((s) => s.items.map(itemText))
}

/** One line under the title on the card: how big it is, when, where. */
export function summaryOf(action: AiAction, preview: AiActionPreview): string {
  switch (action.type) {
    case 'create_checklist': {
      const n = checklistItems(action).length
      const k = action.sections.length
      return `${count(n, ['пункт', 'пункти', 'пунктів'])} у ${count(k, ['розділі', 'розділах', 'розділах'])}`
    }
    case 'create_event':
      return whenOf(action)
    case 'create_board': {
      const n = action.columns.length || 4
      return count(n, ['колонка', 'колонки', 'колонок'])
    }
    case 'create_card': {
      const where = [fact(preview, 'Дошка'), fact(preview, 'Колонка')].filter(Boolean).join(' › ')
      const checks = action.checks.length
        ? count(action.checks.length, ['підзадача', 'підзадачі', 'підзадач'])
        : ''
      return [where, checks].filter(Boolean).join(' · ')
    }
    case 'create_snippet':
    case 'create_component':
      return `${count(action.code.split('\n').length, ['рядок', 'рядки', 'рядків'])} · ${action.language}`
    case 'create_word':
      return action.translation
    case 'create_bookmark':
      return action.url ? hostOf(action.url) : 'без посилання'
    case 'create_library':
      return action.purpose
    case 'create_template':
      return SITUATION_LABEL[action.situation]
    case 'create_claude':
      return `${CLAUDE_KIND_LABEL[action.kind]} · ${count(words(action.content), WORDS)}`
    case 'create_idea':
      return count(words(action.body), WORDS)
    case 'create_note':
      return [action.folder, count(words(action.body), WORDS)].filter(Boolean).join(' · ')
    case 'create_fix':
      return action.context || count(words(action.solution), WORDS)
    case 'create_question':
      return action.topic || count(words(action.answer), WORDS)
    case 'create_redflag':
      return mdPreview(action.signs)
    case 'create_case':
      return [action.client, action.stack].filter(Boolean).join(' · ')
    case 'append_text':
      return `+${count(words(action.text), WORDS)} в кінець`
    case 'add_tags':
      return action.tags.join(', ')
  }
}

/** Up to three lines of the content on the card: the first items, the start of the text. */
export function teaserOf(action: AiAction): string[] {
  const lines = (text: string): string[] =>
    text
      .split('\n')
      .map((l) => mdPreview(l))
      .filter(Boolean)
      .slice(0, 3)
  switch (action.type) {
    case 'create_checklist':
      return checklistItems(action).slice(0, 3)
    case 'create_card':
      return action.checks.length ? action.checks.slice(0, 3) : lines(action.description)
    case 'create_board':
      return action.columns.length ? [action.columns.join(' · ')] : []
    case 'create_snippet':
    case 'create_component':
      return action.code
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, 3)
    case 'create_word':
      return [action.example].filter(Boolean)
    case 'create_event':
      return lines(action.description)
    case 'create_idea':
    case 'create_note':
      return lines(action.body)
    case 'create_claude':
      return lines(action.summary || action.content)
    case 'create_fix':
      return lines(action.solution)
    case 'create_question':
      return lines(action.answer)
    case 'create_template':
      return lines(action.body)
    case 'create_redflag':
      return lines(action.action)
    case 'create_case':
      return lines(action.whatDone || action.problem)
    case 'create_bookmark':
      return lines(action.notes)
    case 'create_library':
      return [action.installCmd].filter(Boolean)
    case 'append_text':
      return lines(action.text)
    case 'add_tags':
      return []
  }
}
