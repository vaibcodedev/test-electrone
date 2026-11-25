import { useEffect, useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { useReadOnly } from './detail-mode-context'
import { acceptNumberText, isTypingEvent, parseNumberText, precisionOf } from '@/lib/limits'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Number field that lets you type freely within its rules: the text may be empty or half-typed («», «0,», «-»)
 * while editing, but a key that can never give a valid number is refused (acceptNumberText: letters, a separator in
 * a whole-number field, decimals past the precision, a number past max). The value is committed on blur / Enter,
 * clamped to [min, max] and rounded to `step` and the precision.
 * A controlled <input type="number"> that coerces on every keystroke makes it impossible to
 * clear «1» and type «20» — never use that pattern (docs/design-system.md → Формы).
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  integer,
  precision: precisionProp,
  allowEmpty = false,
  ...props
}: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** Whole numbers only (counts, connects). */
  integer?: boolean
  /** Digits after the separator when neither `integer` nor `step` says it; 2 by default. */
  precision?: number
  /** Empty input commits `null` instead of falling back to `min ?? 0`. */
  allowEmpty?: boolean
} & Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'>) {
  const readOnly = useReadOnly()
  // Decimal comma, as in NumberField and everywhere in the interface.
  const show = (v: number | null): string =>
    v === null || Number.isNaN(v) ? '' : String(v).replace('.', ',')
  const [text, setText] = useState(show(value))
  const [focused, setFocused] = useState(false)
  const precision = precisionOf({ integer, step, precision: precisionProp })

  // Follow outside changes while the user isn't typing here.
  useEffect(() => {
    if (!focused) setText(show(value))
  }, [value, focused])

  const commit = (): void => {
    let n = parseNumberText(text)
    if (n === null) {
      if (allowEmpty) {
        onChange(null)
        setText('')
        return
      }
      n = min ?? 0
    }
    if (integer) n = Math.round(n)
    else if (step) n = Math.round(n / step) * step
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    n = Number(n.toFixed(precision))
    setText(show(n))
    if (n !== value) onChange(n)
  }

  const typed = parseNumberText(text)
  const outOfRange =
    typed !== null && ((min !== undefined && typed < min) || (max !== undefined && typed > max))

  // Reading: the number as text, grouped like everywhere else («9 000 000»); none — the field hides itself.
  if (readOnly)
    return value === null || Number.isNaN(value) ? (
      <span data-empty />
    ) : (
      <span data-view className={cn('text-body tabular-nums', props.className)}>
        {fmtNumber(value)}
      </span>
    )

  return (
    <Input
      {...props}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      aria-invalid={props['aria-invalid'] ?? (outOfRange || undefined)}
      onFocus={(e) => {
        setFocused(true)
        props.onFocus?.(e)
      }}
      onChange={(e) => {
        // Digits, one separator and a minus (only where min allows it); leading zeros dropped («024» → «24»);
        // while typing, nothing that can't fit the range and the precision.
        const next = acceptNumberText(e.target.value, {
          integer,
          min,
          max,
          precision,
          typing: isTypingEvent(e.nativeEvent)
        })
        if (next !== null) setText(next)
      }}
      onBlur={(e) => {
        setFocused(false)
        commit()
        props.onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        props.onKeyDown?.(e)
      }}
    />
  )
}
