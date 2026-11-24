import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-0.5 text-meta font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        lime: 'bg-lime text-lime-foreground',
        soft: 'bg-surface text-foreground',
        outline: 'border border-input text-foreground',
        ink: 'bg-ink text-ink-foreground',
        warn: 'bg-warn/15 text-warn',
        info: 'bg-info/15 text-info',
        success: 'bg-success/15 text-success',
        destructive: 'bg-destructive/12 text-destructive'
      }
    },
    defaultVariants: { variant: 'soft' }
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
