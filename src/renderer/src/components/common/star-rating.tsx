import type { ReactElement } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useReadOnly } from './detail-mode-context'

const STARS = [1, 2, 3, 4, 5]

/** Filled up to the value: lime fill with a foreground outline reads on card and surface in both themes. */
const starClass = (n: number, value: number): string =>
  cn('size-4', n <= value ? 'fill-lime text-foreground' : 'text-muted-foreground')

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
