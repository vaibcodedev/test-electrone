import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/** "від 0 до 100 %", "не більше 5", "від 0". */
function rangeText(min: number | undefined, max: number | undefined, unit?: string): string {
  const u = unit ? ` ${unit}` : ''
  if (min !== undefined && max !== undefined) return `Від ${min} до ${max}${u}`
  if (max !== undefined) return `Не більше ${max}${u}`
  return `Не менше ${min}${u}`
}

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
  onValidityChange
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
}) {
  const readOnly = useReadOnly()
  const [text, setText] = useState(toText(value))
  useEffect(() => setText(toText(value)), [value])

  const raw = text.trim().replace(',', '.')
  const parsed = raw === '' ? null : Number(raw)
  const invalid =
    parsed !== null &&
    (Number.isNaN(parsed) ||
      (min !== undefined && parsed < min) ||
      (max !== undefined && parsed > max))

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

  const onChange = (input: string): void => {
    if (integer) {
      // Digits only, no leading zeros: "024242" → "24242".
      const digits = input.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
      setText(digits)
    } else {
      setText(input.replace(/[^\d.,-]/g, ''))
    }
  }

  if (readOnly) {
    if (value === null || value === undefined) return null
    return (
      <Field label={label} className={className}>
        <span className="text-body tabular-nums">
          {value}
          {unit ? ` ${unit}` : ''}
        </span>
      </Field>
    )
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      className={className}
      hint={hint}
      error={invalid ? rangeText(min, max, unit) : undefined}
    >
      <InputGroup>
        <InputGroupInput
          id={id}
          inputMode={integer ? 'numeric' : 'decimal'}
          step={step}
          value={text}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={invalid || undefined}
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
