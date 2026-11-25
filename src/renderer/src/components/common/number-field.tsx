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

const toText = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v)

/** "Від 0 до 100 %", "Не більше 5", "Не менше 0" — called only when a bound was crossed. */
function rangeText(min: number | undefined, max: number | undefined, unit?: string): string {
  const u = unit ? ` ${unit}` : ''
  if (min !== undefined && max !== undefined) return `Від ${fmtNumber(min)} до ${fmtNumber(max)}${u}`
  if (max !== undefined) return `Не більше ${fmtNumber(max)}${u}`
  return `Не менше ${fmtNumber(min ?? 0)}${u}`
}

const NOT_A_NUMBER = 'Введіть число, наприклад 4,9'

/**
 * Number field with the schema range (rangesOf): typing is filtered (digits only for integers,
 * no leading zeros), an out-of-range value shows «Від … до …» under the field and is never saved.
 * Commits on blur / Enter, so it works both for autosaving pages and for dialog state.
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
  error
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
}) {
  const readOnly = useReadOnly()
  const autoId = useId()
  const inputId = id ?? autoId
  const [text, setText] = useState(toText(value))
  useEffect(() => setText(toText(value)), [value])

  const parsed = parseNumberText(text)
  // Half-typed text («-», «,») is not a number yet: it gets its own message, not a misleading range.
  const notNumber = parsed === null && text.trim() !== ''
  const outOfRange = parsed !== null && ((min !== undefined && parsed < min) || (max !== undefined && parsed > max))
  const invalid = notNumber || outOfRange

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
    if (next !== null) setText(next)
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
      error={error ?? (notNumber ? NOT_A_NUMBER : outOfRange ? rangeText(min, max, unit) : undefined)}
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
          onBlur={commit}
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
export function useInvalidFields(): { invalid: boolean; report: (key: string) => (invalid: boolean) => void } {
  const [bad, setBad] = useState<Record<string, boolean>>({})
  return {
    invalid: Object.values(bad).some(Boolean),
    report: (key) => (invalid) => setBad((b) => (!!b[key] === invalid ? b : { ...b, [key]: invalid }))
  }
}
