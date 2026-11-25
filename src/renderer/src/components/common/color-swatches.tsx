import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Names of the TAG_COLORS palette: a hex code says nothing to a screen reader or in a tooltip. */
const COLOR_NAMES: Record<string, string> = {
  '#d4f542': 'Лаймовий',
  '#7c8cf8': 'Фіолетово-синій',
  '#f5a524': 'Помаранчевий',
  '#f06b6b': 'Червоний',
  '#3fbf9b': 'Зелений',
  '#c98af0': 'Бузковий',
  '#5aa9f0': 'Блакитний',
  '#9a9f93': 'Сірий'
}

const NONE = '__none__'

/**
 * Colour of a record (tag, platform, board, event) as round swatches (shadcn ToggleGroup, radio semantics).
 * The chosen one has a ring and a tick, so it doesn't rely on colour alone. A swatch is named by `names`,
 * then COLOR_NAMES, then its hex (e2e finds custom colours by hex). `allowNone` adds «Без кольору» first.
 */
export function ColorSwatches({
  colors,
  value,
  onChange,
  allowNone = false,
  noneLabel = 'Без кольору',
  names,
  label = 'Колір',
  className
}: {
  colors: readonly string[]
  value: string | null
  onChange: (color: string | null) => void
  allowNone?: boolean
  noneLabel?: string
  names?: Record<string, string>
  /** Name of the group for screen readers. */
  label?: string
  className?: string
}): ReactElement {
  const nameOf = (c: string): string => names?.[c] ?? COLOR_NAMES[c] ?? c
  const current = value ?? (allowNone ? NONE : '')
  return (
    <ToggleGroup
      type="single"
      spacing={1.5}
      aria-label={label}
      value={current}
      onValueChange={(v) => v && onChange(v === NONE ? null : v)}
      className={cn('flex-wrap', className)}
    >
      {allowNone && (
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={NONE}
              aria-label={noneLabel}
              className="size-7 min-w-7 rounded-full p-0 ring-1 ring-border on:bg-transparent on:ring-2 on:ring-foreground"
            >
              <span className="size-3 rounded-full bg-muted-foreground/40" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{noneLabel}</TooltipContent>
        </Tooltip>
      )}
      {colors.map((c) => (
        <Tooltip key={c}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={c}
              aria-label={nameOf(c)}
              className="size-7 min-w-7 rounded-full p-0 ring-offset-2 ring-offset-card hover:opacity-90 on:ring-2 on:ring-foreground"
              // A user colour from the data, not a theme token (docs/design-system.md → Цвета).
              style={{ background: c }}
            >
              {current === c && <Check className="size-3.5 text-black/70" />}
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{nameOf(c)}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}
