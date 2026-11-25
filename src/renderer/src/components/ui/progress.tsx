"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  max,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const limit = max ?? 100
  // Root gets the value (aria-valuenow; without it the bar is announced as busy), clamped: above max Radix logs
  // an error and falls back to indeterminate.
  const shown = value == null ? value : Math.min(Math.max(value, 0), limit)
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={shown}
      max={max}
      className={cn(
        // Neutral track visible on any surface; fill = chart-1 (contrast-checked). docs/design-system.md → Прогресс.
        "relative h-2 w-full overflow-hidden rounded-full bg-foreground/10",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-chart-1 transition-all"
        style={{ transform: `translateX(-${100 - ((shown ?? 0) / limit) * 100}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
