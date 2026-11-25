import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { acceptNumberText, parseNumberText } from '@/lib/limits'
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
 * Number field with the schema range (rangesOf): typing is filtered (digits only for integers,
 * no leading zeros), an out-of-range value shows «Від … до …» under the field and is never saved.
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
  unit,
  placeholder,
  className,
  onValidityChange,
  disabled,
  autoFocus,
  error,
  live
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
  step?: number
  /** Whole numbers only (connects, counts). */
  integer?: boolean
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

  const parsed = parseNumberText(text)
  // Half-typed text («-», «,») is not a number yet: it gets its own message, not a misleading range.
  const notNumber = parsed === null && text.trim() !== ''
  const outside = (n: number): boolean =>
    (min !== undefined && n < min) || (max !== undefined && n > max)
  const outOfRange = parsed !== null && outside(parsed)
  // A disabled field can't be fixed, so it neither holds the dialog's submit button nor shows an error.
  const invalid = !disabled && (notNumber || outOfRange)
  const own = !invalid ? undefined : notNumber ? NOT_A_NUMBER : rangeText(min, max, unit)

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

  // Same rule as NumberInput: text that can't become a number is not accepted at all.
  const onChange = (input: string): void => {
    const next = acceptNumberText(input, { integer, min })
    if (next === null) return
    setText(next)
    if (!live) return
    const n = parseNumberText(next)
    if ((next === '' || (n !== null && !outside(n))) && n !== (value ?? null)) onCommit(n)
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
          onChange={(e) => onChange(e.target.value)}
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
