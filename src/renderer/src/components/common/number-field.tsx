import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  acceptNumberText,
  decimalsIn,
  isTypingEvent,
  parseNumberText,
  precisionOf,
  precisionText
} from '@/lib/limits'
import { fmtNumber } from '@/lib/format'
import { Field } from '@/components/common/page'
import { useReadOnly } from '@/components/common/detail-mode'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '@/components/ui/input-group'

/** Decimal comma, as everywhere in the interface (docs/design-system.md → Числа в тексте). */
const toText = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v).replace('.', ',')

/** "Від 0 до 100 %", "Не більше 5", "Не менше 0" — called only when a bound was crossed. */
function rangeText(min: number | undefined, max: number | undefined, unit?: string): string {
  const u = unit ? ` ${unit}` : ''
  if (min !== undefined && max !== undefined)
    return `Від ${fmtNumber(min)} до ${fmtNumber(max)}${u}`
  if (max !== undefined) return `Не більше ${fmtNumber(max)}${u}`
  return `Не менше ${fmtNumber(min ?? 0)}${u}`
}

const NOT_A_NUMBER = 'Введіть число, наприклад 4,9'

/**
 * Number field with the schema rules (rangesOf: range, whole numbers, step). Typing takes only what can still become
 * a valid value (acceptNumberText): no letters, a separator («,» or «.») only where fractions are allowed, no more
 * decimals than the step has (money: 2), never past max — 24 digits in a 0–100 000 000 field stop at the eighth.
 * Pasted text that breaks a rule shows why under the field («Від … до …», «Не більше одного знака після коми») and
 * is never saved.
 * Commits on blur / Enter, so it works both for autosaving pages and for dialog state; `live` commits while typing.
 * Units go into the input as an addon (`$ % ★`), not into the label (docs/design-system.md → Формы).
 */
export function NumberField({
  id,
  label,
  hint,
  value,
  onCommit,
  min,
  max,
  step,
  integer,
  precision: precisionProp,
  unit,
  placeholder,
  className,
  onValidityChange,
  disabled,
  autoFocus,
  error,
  live,
  required
}: {
  /** Ties the label to the input (click on the label focuses it). */
  id?: string
  label: string
  /** Quiet explanation under the input (hidden while the value is out of range). */
  hint?: ReactNode
  value: number | null | undefined
  onCommit: (value: number | null) => void
  min?: number
  max?: number
  /** From the schema (`.multipleOf`) or the field: its decimals are the field's precision (0,1 → one digit). */
  step?: number
  /** Whole numbers only (connects, counts). */
  integer?: boolean
  /** Digits after the separator, when neither `integer` nor `step` says it; 2 by default (money). */
  precision?: number
  /** Shown inside the input on the right: $, %, ★. */
  unit?: string
  placeholder?: string
  className?: string
  /**
   * Tells a dialog that the typed value is out of range (it is never committed), so the dialog can
   * block its submit button instead of silently saving the old value. Reports `false` on unmount.
   */
  onValidityChange?: (invalid: boolean) => void
  disabled?: boolean
  autoFocus?: boolean
  /** The caller's own error (a pair «від» > «до»…): shown under the field and marks the input invalid. */
  error?: ReactNode
  /**
   * Commit every valid keystroke, not on blur — for dialogs whose submit button depends on the value: otherwise
   * «12» + a click on «Додати» is lost (the button is still disabled when the click lands). Off on autosaving
   * pages, where each commit is a save.
   */
  live?: boolean
  /** Must be filled (`requiredOf(schema)`): the form's submit stays off while it is empty (Field required). */
  required?: boolean
}) {
  const readOnly = useReadOnly()
  const autoId = useId()
  const inputId = id ?? autoId
  const [text, setText] = useState(toText(value))
  // Follows outside changes during render, not in an effect, and keeps the text when it already means this value:
  // in live mode «1,» commits 1 and must not turn into «1» under the cursor.
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    if (parseNumberText(text) !== (value ?? null)) setText(toText(value))
  }

  const precision = precisionOf({ integer, step, precision: precisionProp })
  const parsed = parseNumberText(text)
  // Half-typed text («-», «,») is not a number yet: it gets its own message, not a misleading range.
  const notNumber = parsed === null && text.trim() !== ''
  const outside = (n: number): boolean =>
    (min !== undefined && n < min) || (max !== undefined && n > max)
  const outOfRange = parsed !== null && outside(parsed)
  // Too many decimals can only be pasted (typing stops at the precision). A stored value is shown as it is: a rating
  // of 4,95 from before the 0,1 step opens without an error and is only checked once it is edited.
  const tooPrecise = parsed !== null && decimalsIn(text) > precision && text !== toText(value)
  // A disabled field can't be fixed, so it neither holds the dialog's submit button nor shows an error.
  const invalid = !disabled && (notNumber || outOfRange || tooPrecise)
  const own = !invalid
    ? undefined
    : notNumber
      ? NOT_A_NUMBER
      : outOfRange
        ? rangeText(min, max, unit)
        : precisionText(precision)

  const report = useRef(onValidityChange)
  useEffect(() => {
    report.current = onValidityChange
  })
  useEffect(() => {
    report.current?.(invalid)
  }, [invalid])
  useEffect(() => () => report.current?.(false), [])

  const commit = (): void => {
    if (invalid) return
    if (parsed !== (value ?? null)) onCommit(parsed)
  }

  // Same rule as NumberInput: a key that can't lead to a valid number is not accepted at all.
  const onChange = (input: string, typing: boolean): void => {
    const next = acceptNumberText(input, { integer, min, max, precision, typing })
    if (next === null) return
    setText(next)
    if (!live) return
    const n = parseNumberText(next)
    const fits = n !== null && !outside(n) && decimalsIn(next) <= precision
    if ((next === '' || fits) && n !== (value ?? null)) onCommit(n)
  }

  // Blur also tidies the text: «1,» → «1».
  const onBlur = (): void => {
    commit()
    if (!invalid && parsed !== null) setText(toText(parsed))
  }

  if (readOnly) {
    if (value === null || value === undefined) return null
    return (
      <Field label={label} className={className}>
        <span data-view className="text-body tabular-nums">
          {fmtNumber(value)}
          {unit ? ` ${unit}` : ''}
        </span>
      </Field>
    )
  }

  return (
    <Field
      label={label}
      htmlFor={inputId}
      required={required}
      className={className}
      hint={hint}
      // Own message first; `|| undefined`: a caller's `cond && 'текст'` gives false, not an error.
      error={own ?? (error || undefined)}
    >
      <InputGroup>
        <InputGroupInput
          id={inputId}
          inputMode={integer ? 'numeric' : 'decimal'}
          step={step}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={invalid || !!error || undefined}
          className="tabular-nums"
          onChange={(e) => onChange(e.target.value, isTypingEvent(e.nativeEvent))}
          onBlur={onBlur}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        {unit && (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
    </Field>
  )
}

/**
 * Collects `onValidityChange` of several NumberFields in a dialog: `invalid` is true while any of
 * them holds an out-of-range value, so the dialog disables its submit button.
 */
export function useInvalidFields(): {
  invalid: boolean
  report: (key: string) => (invalid: boolean) => void
} {
  const [bad, setBad] = useState<Record<string, boolean>>({})
  return {
    invalid: Object.values(bad).some(Boolean),
    report: (key) => (invalid) =>
      setBad((b) => (!!b[key] === invalid ? b : { ...b, [key]: invalid }))
  }
}
