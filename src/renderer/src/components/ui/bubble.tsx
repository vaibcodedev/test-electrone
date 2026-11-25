import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

// shadcn `bubble` (registry, chat rules): the surface of a message. Restyled: state layers and the tile layer
// instead of the primary/secondary fills (docs/design-system.md §5), the tile radius 18 (rounded-xl), type roles.

function BubbleGroup({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="bubble-group"
      className={cn('flex min-w-0 flex-col gap-2', className)}
      {...props}
    />
  )
}

const bubbleVariants = cva(
  'group/bubble relative flex w-fit max-w-[85%] min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end data-[align=end]:self-end data-[variant=answer]:max-w-full data-[variant=ghost]:max-w-full',
  {
    variants: {
      variant: {
        // The person's own message: the tile layer on the paper panel.
        default:
          '*:data-[slot=bubble-content]:bg-surface *:data-[slot=bubble-content]:text-foreground',
        secondary:
          '*:data-[slot=bubble-content]:bg-foreground/6 *:data-[slot=bubble-content]:text-foreground',
        muted:
          '*:data-[slot=bubble-content]:bg-foreground/4 *:data-[slot=bubble-content]:text-muted-foreground',
        outline: '*:data-[slot=bubble-content]:border-border *:data-[slot=bubble-content]:bg-card',
        // The assistant's answer: a surface of its own, a shade apart from the person's (bg-surface), so who
        // speaks reads at a glance; as wide as the column — answers carry lists and code.
        answer:
          '*:data-[slot=bubble-content]:bg-foreground/5 *:data-[slot=bubble-content]:text-foreground *:data-[slot=bubble-content]:py-3',
        // Plain text with no surface.
        ghost:
          '*:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0',
        destructive:
          '*:data-[slot=bubble-content]:bg-destructive/8 *:data-[slot=bubble-content]:text-destructive'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Bubble({
  variant = 'default',
  align = 'start',
  className,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof bubbleVariants> & {
    align?: 'start' | 'end'
  }): React.ReactElement {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  )
}

function BubbleContent({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  asChild?: boolean
}): React.ReactElement {
  const Comp = asChild ? Slot.Root : 'div'

  return (
    <Comp
      data-slot="bubble-content"
      className={cn(
        'w-fit max-w-full min-w-0 overflow-hidden rounded-xl border border-transparent px-4 py-2.5 text-body leading-relaxed wrap-break-word group-data-[align=end]/bubble:self-end [button]:text-left',
        className
      )}
      {...props}
    />
  )
}

export { BubbleGroup, Bubble, BubbleContent }
