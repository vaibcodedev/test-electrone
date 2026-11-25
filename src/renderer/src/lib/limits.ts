import type { z } from 'zod'
import { fmtNumber } from '@/lib/format'

type AnySchema = {
  def?: {
    type?: string
    innerType?: AnySchema
    checks?: { _zod: { def: { check: string; value?: unknown } } }[]
  }
  minLength?: number | null
  maxLength?: number | null
  minValue?: number | null
  maxValue?: number | null
  isInt?: boolean
}

/**
 * Max string lengths of a zod object schema, read from the schema itself (zod 4 `.maxLength`).
 * Forms pass them to `maxLength` and to `Field count`, so the UI stops exactly where the server
 * validation would reject — one source of truth (docs/design-system.md → Ограничения ввода).
 */
export function limitsOf<S extends z.ZodObject>(schema: S): Partial<Record<keyof z.infer<S>, number>> {
  const out: Record<string, number> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    let t = field as AnySchema
    // default / optional / nullable / catch wrap the real string schema
    while (t.def?.innerType) t = t.def.innerType
    if (typeof t.maxLength === 'number') out[key] = t.maxLength
  }
  return out as Partial<Record<keyof z.infer<S>, number>>
}

/** Wrappers that let a value be left out: the server fills a default, or takes nothing / null. */
const OPTIONAL = new Set(['optional', 'nullable', 'default', 'prefault', 'catch', 'nullish'])

/**
 * Fields a form can't be sent without, read from the zod input schema: a string that must not be empty
 * (`.min(1)`, `.trim().min(1)`), a number or an enum with no default. Anything optional, nullable or with a default
 * is not required — the server fills it. A form marks these `Field required`: the control gets `required`, the
 * submit stays off until it is filled, and the reason names it («Заповніть: Назва») — one source of truth with
 * the server (docs/design-system.md → Формы).
 */
export function requiredOf<S extends z.ZodObject>(
  schema: S
): Partial<Record<keyof z.infer<S>, true>> {
  const out: Record<string, true> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    let t = field as AnySchema
    let optional = false
    while (t.def?.innerType) {
      if (OPTIONAL.has(t.def.type ?? '')) optional = true
      t = t.def.innerType
    }
    if (optional) continue
    const type = t.def?.type
    if (
      (type === 'string' && typeof t.minLength === 'number' && t.minLength > 0) ||
      type === 'number' ||
      type === 'enum'
    )
      out[key] = true
  }
  return out as Partial<Record<keyof z.infer<S>, true>>
}

/** What a number field of the schema takes: its range, whole numbers only (`.int()`), the step (`.multipleOf()`). */
export type NumberRange = { min?: number; max?: number; integer?: true; step?: number }

/**
 * Number rules of a zod object schema (zod 4 `.minValue` / `.maxValue` / `.isInt`, `.multipleOf()` checks), spread
 * into NumberField / NumberInput: a 0–15% commission field can't take 4242, a rating of step 0,1 can't take 4,99.
 */
export function rangesOf<S extends z.ZodObject>(schema: S): Partial<Record<keyof z.infer<S>, NumberRange>> {
  const out: Record<string, NumberRange> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    let t = field as AnySchema
    while (t.def?.innerType) t = t.def.innerType
    const min = typeof t.minValue === 'number' && Number.isFinite(t.minValue) ? t.minValue : undefined
    const max = typeof t.maxValue === 'number' && Number.isFinite(t.maxValue) ? t.maxValue : undefined
    if (min === undefined && max === undefined) continue
    const range: NumberRange = { min, max }
    if (t.isInt) range.integer = true
    const step = t.def?.checks?.find((c) => c._zod.def.check === 'multiple_of')?._zod.def.value
    if (typeof step === 'number' && !range.integer) range.step = step
    out[key] = range
  }
  return out as Partial<Record<keyof z.infer<S>, NumberRange>>
}

/** What a number field accepts: an optional minus, digits, one decimal separator. */
const NUMBER_TEXT_RE = /^-?\d*[.,]?\d*$/
/** The same for whole numbers. */
const INTEGER_TEXT_RE = /^-?\d*$/

/** «1 234,5» → 1234.5; empty or half-typed text («-», «,») → null. */
export function parseNumberText(text: string): number | null {
  const s = text.replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

/** Decimal places of a step: 0.1 → 1, 0.25 → 2, 0.0001 → 4, 1 → 0. */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const [mantissa, exp] = String(step).split('e-')
  const own = mantissa.split('.')[1]?.length ?? 0
  return own + (exp ? Number(exp) : 0)
}

/**
 * Digits a field takes after the separator: 0 for whole numbers, the step's own (0,1 → 1), otherwise 2 — money,
 * hours and percents need no more (an exchange rate passes `step={0.0001}`).
 */
export function precisionOf(opts: {
  integer?: boolean
  step?: number
  precision?: number
}): number {
  if (opts.integer) return 0
  if (opts.precision !== undefined) return opts.precision
  return opts.step ? decimalsOf(opts.step) : 2
}

/** Digits typed after the separator: «4,99» → 2, «12» → 0. */
export function decimalsIn(text: string): number {
  const t = text.replace(/\s/g, '')
  const at = t.search(/[.,]/)
  return at < 0 ? 0 : t.length - at - 1
}

/** Rules of one number field: the schema range (rangesOf) and how many decimals it takes (precisionOf). */
export type NumberRules = { min?: number; max?: number; integer?: boolean; precision?: number }

/**
 * Can typing more characters after `t` still give a number inside [min, max]? Appending only moves a number away
 * from zero: «5» can become 5…∞, «4,9» only 4,9…5, «0» only 0…1 (a next digit replaces the zero: «05» → «5»), and
 * a text with all its decimals typed is final. So «424242424» for max 100 000 000, «5,1» for max 5 and «0» for
 * min 1 are refused at the key that makes them impossible.
 */
function reachable(
  t: string,
  { min = -Infinity, max = Infinity, integer, precision }: NumberRules
): boolean {
  const negative = t.startsWith('-')
  const body = negative ? t.slice(1) : t
  if (body === '') return true
  const at = body.search(/[.,]/)
  const whole = at < 0 ? body : body.slice(0, at)
  const decimals = at < 0 ? null : body.slice(at + 1)
  const places = integer ? 0 : (precision ?? Infinity)
  if (decimals !== null && decimals.length > places) return false
  // The magnitudes the text can still become: [lo, hi], or [lo, hi) while hi itself is out of reach.
  let lo: number
  let hi: number
  let open: boolean
  if (decimals === null) {
    lo = Number(whole || '0')
    hi = lo !== 0 ? Infinity : places > 0 ? 1 : 0
    open = hi !== 0
  } else {
    lo = Number(`${whole || '0'}.${decimals || '0'}`)
    const final = decimals.length >= places
    hi = final ? lo : lo + 10 ** -decimals.length
    open = !final
  }
  if (!negative) return lo <= max && (open ? hi > min : hi >= min)
  return -lo >= min && (open ? -hi < max : -hi <= max)
}

/**
 * Text for a number field, or null when the edit must be rejected. Always: digits, one separator («,» or «.»),
 * a minus only where min < 0, no leading zeros («024» → «24»). While typing (`typing`, the default) also what can
 * never become a valid value: a separator in a whole-number field, more decimals than `precision`, a number past
 * `max` (so never more digits than max has) and a start no continuation lifts to `min`. Pasted, dropped or
 * shortened text (`typing: false`) passes and is explained under the field instead: a value stored before the
 * rules were tightened can always be shortened.
 */
export function acceptNumberText(
  text: string,
  rules: NumberRules & { typing?: boolean } = {}
): string | null {
  const t = text.replace(/\s/g, '')
  const typing = rules.typing ?? true
  if (!(rules.integer && typing ? INTEGER_TEXT_RE : NUMBER_TEXT_RE).test(t)) return null
  if (t.startsWith('-') && rules.min !== undefined && rules.min >= 0) return null
  const next = t.replace(/^(-?)0+(?=\d)/, '$1')
  if (typing && !reachable(next, rules)) return null
  return next
}

/**
 * Typing (a key, IME) as opposed to paste, drop, delete or undo, from the `input` event of an onChange.
 * An event without `inputType` (a synthetic change) counts as typing: the stricter rules apply.
 */
export function isTypingEvent(event: Event): boolean {
  const type = (event as InputEvent).inputType
  return !type || type === 'insertText' || type === 'insertCompositionText'
}

const DECIMALS_WORD: Record<number, string> = {
  1: 'одного знака',
  2: 'двох знаків',
  3: 'трьох знаків',
  4: 'чотирьох знаків'
}

/** «Не більше одного знака після коми» / «Тільки ціле число» — a pasted 4,99 in a field of step 0,1. */
export function precisionText(precision: number): string {
  if (precision <= 0) return 'Тільки ціле число'
  return `Не більше ${DECIMALS_WORD[precision] ?? `${precision} знаків`} після коми`
}

/**
 * A text stored before its limit was lowered (or pasted past it): the field explains why its edits won't save.
 * Nothing is cut: the person decides what to remove.
 */
export function overLimitText(length: number, max: number): string {
  return `Текст задовгий: ${fmtNumber(length)} із ${fmtNumber(max)} символів. Скоротіть його, щоб зберегти зміни`
}

/** Loose "is this a link" check for URL fields: scheme or a domain-looking host, no spaces. */
export function isLikelyUrl(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (/\s/.test(v)) return false
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(v)) return true
  // A real host: a domain with a dot (and a 2+ letter TLD), localhost or an IPv4 — «http://lol» is not a link.
  const host = /^(?:(?:https?|ftp):\/\/)?([^/?#:\s]+)(?::\d+)?(?:[/?#].*)?$/i.exec(v)?.[1]
  if (!host) return false
  // Letters of any script: приклад.укр is a link too.
  return /^([\p{L}\p{N}_-]+\.)+\p{L}{2,}$/u.test(host) || host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

export const URL_ERROR = 'Не схоже на посилання — наприклад, https://example.com'
