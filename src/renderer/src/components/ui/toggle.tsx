'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Toggle as TogglePrimitive } from 'radix-ui'

/**
 * Variants:
 *  - default: quiet icon/text toggle
 *  - chip:    filter pill, selected = lime (reference: "Wrong size" chips)
 *  - chip-neutral: the same pill choosing a value, selected = neutral tint
 *  - segment: segmented control item, selected = raised neutral pill (card in light, lifted grey in dark)
 *  - outline
 *  - status:  outline toggle of a record state («Працює», «Вирішено»), pressed = success tint
 */
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full text-body font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-transparent text-muted-foreground hover:bg-surface hover:text-foreground on:bg-surface on:text-foreground',
        // Tinted, not bg-surface: an unselected chip on a surface card used to look like plain text.
        chip: 'bg-foreground/6 font-normal text-foreground hover:bg-foreground/10 on:bg-lime on:font-medium on:text-lime-foreground on:focus-visible:ring-lime-foreground',
        // A chip that picks a value (record type in quick add, FilterChips tone="neutral"), not a screen filter:
        // the dialog's lime belongs to its submit button.
        'chip-neutral':
          'bg-foreground/6 font-normal text-foreground hover:bg-foreground/10 on:bg-foreground/12 on:font-medium on:text-foreground on:focus-visible:ring-ring',
        segment:
          'font-normal text-muted-foreground hover:text-foreground on:bg-card on:font-medium on:text-foreground on:shadow-sm dark:on:bg-foreground/12',
        outline:
          'border border-input bg-transparent hover:bg-surface on:border-transparent on:bg-ink on:text-ink-foreground on:focus-visible:ring-ink-accent',
        status:
          'border border-input bg-transparent font-normal hover:bg-surface on:border-transparent on:bg-success/12 on:text-success on:hover:bg-success/16'
      },
      size: {
        default: 'h-9 min-w-9 px-3.5',
        sm: 'h-8 min-w-8 px-3',
        xs: 'h-7 min-w-7 px-2.5 text-caption',
        lg: 'h-10 min-w-10 px-4'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    // Props first, data-slot last (as in Button): a Tooltip trigger (asChild) would overwrite it.
    <TogglePrimitive.Root
      {...props}
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
    />
  )
}

export { Toggle, toggleVariants }
