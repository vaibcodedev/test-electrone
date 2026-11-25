"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

/**
 * Variants:
 *  - default: quiet icon/text toggle
 *  - chip:    filter pill, selected = lime (reference: "Wrong size" chips)
 *  - segment: segmented control item, selected = raised neutral pill (card in light, lifted grey in dark)
 *  - outline
 */
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full text-body font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-muted-foreground hover:bg-surface hover:text-foreground on:bg-surface on:text-foreground",
        // Tinted, not bg-surface: an unselected chip on a surface card used to look like plain text.
        chip: "bg-foreground/[0.06] font-normal text-foreground hover:bg-foreground/[0.1] on:bg-lime on:font-medium on:text-lime-foreground on:focus-visible:ring-lime-foreground",
        segment:
          "font-normal text-muted-foreground hover:text-foreground on:bg-card on:font-medium on:text-foreground on:shadow-sm dark:on:bg-foreground/12",
        outline:
          "border border-input bg-transparent hover:bg-surface on:border-transparent on:bg-ink on:text-ink-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-3.5",
        sm: "h-8 min-w-8 px-3",
        xs: "h-7 min-w-7 px-2.5 text-caption",
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
