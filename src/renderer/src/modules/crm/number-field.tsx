import { useEffect, useState } from 'react'
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
 */
export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  integer,
  unit,
  placeholder,
  className
}: {
  label: string
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
      className={className}
      error={invalid ? rangeText(min, max, unit) : undefined}
    >
      <InputGroup>
        <InputGroupInput
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
