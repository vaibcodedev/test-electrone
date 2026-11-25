import type { ReactElement } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PLATFORM_COLORS } from './proposal-labels'

/** Platform colour: «no colour» + the palette as round swatches. */
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
      <ToggleGroupItem
        value="none"
        aria-label="Без кольору"
        className="size-7 min-w-7 rounded-full p-0 ring-1 ring-border on:ring-2 on:ring-foreground"
      >
        <span className="size-3 rounded-full bg-muted-foreground/40" />
      </ToggleGroupItem>
      {PLATFORM_COLORS.map((c) => (
        <ToggleGroupItem
          key={c}
          value={c}
          aria-label={c}
          className="size-7 min-w-7 rounded-full p-0 on:bg-transparent on:ring-2 on:ring-foreground"
        >
          <span className="size-5 rounded-full" style={{ background: c }} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
