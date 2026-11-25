import type { ReactElement } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PLATFORM_COLORS, PLATFORM_COLOR_NAME } from './proposal-labels'

/** Platform colour: «no colour» + the palette as round swatches, each named in a tooltip and for screen readers. */
export function ColorSwatches({
  value,
  onChange
}: {
  value: string | null
  onChange: (c: string | null) => void
}): ReactElement {
  return (
    <ToggleGroup
      type="single"
      value={value ?? 'none'}
      onValueChange={(v) => v && onChange(v === 'none' ? null : v)}
      spacing={1}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem
            value="none"
            aria-label="Без кольору"
            className="size-7 min-w-7 rounded-full p-0 ring-1 ring-border on:ring-2 on:ring-foreground"
          >
            <span className="size-3 rounded-full bg-muted-foreground/40" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>Без кольору</TooltipContent>
      </Tooltip>
      {PLATFORM_COLORS.map((c) => {
        const name = PLATFORM_COLOR_NAME[c] ?? c
        return (
          <Tooltip key={c}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={c}
                aria-label={name}
                className="size-7 min-w-7 rounded-full p-0 on:bg-transparent on:ring-2 on:ring-foreground"
              >
                <span className="size-5 rounded-full" style={{ background: c }} />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        )
      })}
    </ToggleGroup>
  )
}
