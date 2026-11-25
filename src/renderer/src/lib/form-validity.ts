import { FIX_ERRORS, INVALID_FIELD } from './edit-session'

/** The generic reason when a missing field has no readable label. */
export const FILL_REQUIRED = 'Заповніть обов’язкові поля'

/** What a form's submit needs to know about one of its controls. */
export interface ControlState {
  /** Must be filled (`required`, from `requiredOf(schema)` through `Field required`). */
  required: boolean
  /** Empty or only spaces: the server would reject it after `.trim().min(1)`. */
  blank: boolean
  /** The browser's own check passes (type=url, min/max, pattern…), not counting `required`. */
  valid: boolean
  disabled: boolean
  /** The field's name for the reason: its label, else aria-label. */
  label: string
}

/**
 * Why a form can't be sent right now, or undefined when it can. A field that shows an error comes first (that is what
 * the person sees in red); then the required fields still empty, named: «Заповніть: Назва, Сума».
 */
export function blockReason(controls: ControlState[], fieldError: boolean): string | undefined {
  const live = controls.filter((c) => !c.disabled)
  if (fieldError || live.some((c) => !c.valid)) return FIX_ERRORS
  const missing = live.filter((c) => c.required && c.blank)
  if (!missing.length) return undefined
  const names = [...new Set(missing.map((c) => c.label.trim()).filter(Boolean))]
  return names.length ? `Заповніть: ${names.join(', ')}` : FILL_REQUIRED
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const CONTROLS = 'input, textarea, select'

/** Text controls only: a checkbox or a hidden input is never «blank». */
export const isText = (el: Control): boolean =>
  !(el instanceof HTMLInputElement) ||
  !['checkbox', 'radio', 'hidden', 'submit', 'button', 'range', 'color', 'file'].includes(el.type)

/** The visible name of a control: its <label>, the element its aria-labelledby points at, or aria-label. */
function labelOf(el: Control): string {
  const own = el.labels?.[0]?.textContent
  if (own?.trim()) return own
  const by = el.getAttribute('aria-labelledby')
  if (by) {
    const text = by
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
    if (text.trim()) return text
  }
  return el.getAttribute('aria-label') ?? ''
}

/** A required text control that holds nothing but spaces. */
export function isBlankRequired(el: Element): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
  return el.required && !el.disabled && isText(el) && !el.value.trim()
}

/** The state of every control of a form, read from the DOM (hidden selects of Radix included). */
export function readControls(root: ParentNode): ControlState[] {
  return [...root.querySelectorAll<Control>(CONTROLS)]
    .filter((el) => isText(el) || el instanceof HTMLSelectElement)
    .map((el) => {
      const blank = !el.value.trim()
      const v = el.validity
      // `required` is judged by `blank` (spaces count as empty); the rest of the browser's checks stay.
      const other =
        v.typeMismatch ||
        v.patternMismatch ||
        v.rangeOverflow ||
        v.rangeUnderflow ||
        v.stepMismatch ||
        v.tooLong ||
        v.tooShort ||
        v.badInput ||
        v.customError
      const valid = v.valid || !other
      return { required: el.required, blank, valid, disabled: el.disabled, label: labelOf(el) }
    })
}

/**
 * A field in red because it is required and empty (`data-missing` — Field required, the English quick form): that
 * is «Заповніть: …», not an error to fix.
 */
const isMissingOnly = (el: Element): boolean => !!el.closest('[data-missing]')

/** Why the form can't be sent (blockReason over the DOM): a field showing an error, a required field still empty. */
export function formBlockReason(root: ParentNode): string | undefined {
  const shown = [...root.querySelectorAll(INVALID_FIELD)].some((el) => !isMissingOnly(el))
  return blockReason(readControls(root), shown)
}

/** The first field to fix: one that shows an error, else the first empty required one. */
export function firstToFix(root: ParentNode): HTMLElement | null {
  const shown = root.querySelector<HTMLElement>(INVALID_FIELD)
  if (shown) {
    const control = shown.matches(CONTROLS) ? shown : shown.querySelector<HTMLElement>(CONTROLS)
    return control ?? shown
  }
  return [...root.querySelectorAll<HTMLElement>(CONTROLS)].find(isBlankRequired) ?? null
}
