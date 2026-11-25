import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import { COLOR_NAME, PALETTE, type PaletteColor } from '@shared/colors'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const NONE = '__none__'

/**
 * The tick takes whichever of black and white contrasts more with the swatch (WCAG relative luminance): a dark
 * platform colour («#14160f») hid the black tick.
 */
function tickClass(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 'text-black/70'
  const n = parseInt(m[1], 16)
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => lin(c / 255))
  // 0.179: the luminance where black and white give the same contrast.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179 ? 'text-white' : 'text-black/70'
}

/**
 * Colour of a record (tag, platform, board, event) as round swatches (shadcn ToggleGroup, radio semantics).
 * The chosen one has a ring and a tick, so it doesn't rely on colour alone. The ring uses `on:`, which also
 * matches `aria-checked` (globals.css): under a TooltipTrigger `data-state` is the tooltip's.
 * `colors` defaults to the shared PALETTE. A swatch is named by `names`, then COLOR_NAME, then its hex (e2e finds custom colours by hex).
 * `allowNone` adds «Без кольору» first.
 */
export function ColorSwatches({
  colors = PALETTE,
  value,
  onChange,
  allowNone = false,
  noneLabel = 'Без кольору',
  names,
  label = 'Колір',
  className
}: {
  colors?: readonly string[]
  value: string | null
  onChange: (color: string | null) => void
  allowNone?: boolean
  noneLabel?: string
  names?: Record<string, string>
  /** Name of the group for screen readers. */
  label?: string
  className?: string
}): ReactElement {
  const nameOf = (c: string): string => names?.[c] ?? COLOR_NAME[c as PaletteColor] ?? c
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
              {current === NONE ? (
                <Check className="size-3.5 text-foreground" />
              ) : (
                <span className="size-3 rounded-full bg-muted-foreground/40" />
              )}
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
              {current === c && <Check className={cn('size-3.5', tickClass(c))} />}
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{nameOf(c)}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}
