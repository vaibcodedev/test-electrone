import type { ReactElement } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useReadOnly } from './detail-mode-context'

const STARS = [1, 2, 3, 4, 5]

/**
 * Filled up to the value in the warn tone: lime is the screen's one accent («Зберегти» sits next to the
 * stars while editing), and the rating copies in the modules were warn already.
 */
const starClass = (n: number, value: number): string =>
  cn('size-4', n <= value ? 'fill-warn text-warn' : 'text-muted-foreground')

/**
 * 0–5 stars (0 = not rated). Editing: five toggles, the chosen one again resets to 0. Reading: static
 * stars; no rating hides the whole field.
 */
export function StarRating({
  value,
  onChange,
  label = 'Оцінка',
  className
}: {
  value: number
  onChange: (value: number) => void
  /** Group name for screen readers. */
  label?: string
  className?: string
}): ReactElement {
  const viewMode = useReadOnly()
  if (viewMode)
    return value ? (
      <span data-view role="img" aria-label={`${value} з 5`} className={cn('flex items-center gap-0.5', className)}>
        {STARS.map((n) => (
          <Star key={n} aria-hidden className={starClass(n, value)} />
        ))}
      </span>
    ) : (
      <span data-empty />
    )
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      aria-label={label}
      value={value ? String(value) : ''}
      onValueChange={(v) => onChange(v ? Number(v) : 0)}
      className={className}
    >
      {STARS.map((n) => (
        <ToggleGroupItem key={n} value={String(n)} aria-label={`${n} з 5`} title={`${n} з 5`} className="size-8 min-w-8 px-0 on:bg-transparent">
          <Star className={starClass(n, value)} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
