import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useReadOnly } from './detail-mode-context'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** Shown (and shown as the current value) but can't be picked: an old value kept as it was written. */
  disabled?: boolean
}

const NONE = '__none__'

/**
 * shadcn Select with the standard field look (border + tint from ui/select, docs/design-system.md → Формы).
 * `none` adds an empty option; `id` ties it to a Field label. In view mode an empty value hides the whole
 * field (`data-empty`): «Не вказано» is a choice while editing, not a value to read.
 */
export function Choice<T extends string>({
  id,
  'aria-label': ariaLabel,
  value,
  onChange,
  options,
  placeholder,
  className,
  none,
  size = 'default'
}: {
  id?: string
  /** Name of a select without a visible Field label (a status in the record header). */
  'aria-label'?: string
  value: T | null | undefined
  onChange: (value: T | null) => void
  options: ChoiceOption<T>[]
  placeholder?: string
  className?: string
  none?: string
  size?: 'default' | 'sm'
}): ReactElement {
  const viewMode = useReadOnly()
  if (viewMode && value == null) return <span data-empty />
  return (
    <Select
      value={value ?? (none ? NONE : undefined)}
      onValueChange={(v) => onChange(v === NONE ? null : (v as T))}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        size={size}
        className={cn('w-full text-body', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {none && <SelectItem value={NONE}>{none}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
