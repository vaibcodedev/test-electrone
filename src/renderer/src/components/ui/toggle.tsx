"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

/**
 * Variants:
 *  - default: quiet icon/text toggle
 *  - chip:    filter pill, selected = lime (reference: "Wrong size" chips)
 *  - segment: segmented control item, selected = ink pill (use inside ToggleGroup variant="segment")
 *  - outline
 */
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-muted-foreground hover:bg-surface hover:text-foreground data-[state=on]:bg-surface data-[state=on]:text-foreground",
        chip: "bg-surface font-normal text-foreground hover:bg-accent data-[state=on]:bg-lime data-[state=on]:font-medium data-[state=on]:text-lime-foreground",
        segment:
          "font-normal text-muted-foreground hover:text-foreground data-[state=on]:bg-ink data-[state=on]:font-medium data-[state=on]:text-ink-foreground",
        outline:
          "border border-input bg-transparent hover:bg-surface data-[state=on]:border-transparent data-[state=on]:bg-ink data-[state=on]:text-ink-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-3.5",
        sm: "h-8 min-w-8 px-3",
        xs: "h-7 min-w-7 px-2.5 text-xs",
        lg: "h-10 min-w-10 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
