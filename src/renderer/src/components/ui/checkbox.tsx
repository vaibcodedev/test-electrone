'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'

/**
 * Variants:
 *  - default: square box
 *  - round:   lime circle of a run-through item (checklists); the empty border stays the base foreground/50
 */
const checkboxVariants = cva(
  // Unchecked border foreground/50 (≥3:1): the empty square is the only sign of the control. Focus — the
  // global :focus-visible outline (globals.css).
  'peer size-4 shrink-0 rounded-[4px] border border-foreground/50 shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary',
  {
    variants: {
      variant: {
        default: '',
        round:
          'size-5.5 rounded-full bg-card data-[state=checked]:border-lime data-[state=checked]:bg-lime data-[state=checked]:text-lime-foreground dark:data-[state=checked]:bg-lime'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

function Checkbox({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & VariantProps<typeof checkboxVariants>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(checkboxVariants({ variant }), className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
