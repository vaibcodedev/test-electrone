import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-0.5 text-meta font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        lime: 'bg-lime text-lime-foreground',
        // Tint, not a fill: a surface-coloured badge vanished on surface cards.
        soft: 'bg-foreground/7 text-foreground',
        outline: 'border border-input text-foreground',
        ink: 'bg-ink text-ink-foreground',
        warn: 'bg-warn/12 text-warn',
        info: 'bg-info/12 text-info',
        success: 'bg-success/12 text-success',
        destructive: 'bg-destructive/8 text-destructive'
      }
    },
    defaultVariants: { variant: 'soft' }
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  truncate = false,
  title,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    /**
     * Long text ends with «…» and the badge may shrink in a flex row; a string child becomes the `title`.
     * The ellipsis needs an inner span: `truncate` on the inline-flex badge itself cut the text mid-word.
     */
    truncate?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'span'
  const cut = truncate && !asChild
  return (
    <Comp
      data-slot="badge"
      title={title ?? (cut && typeof children === 'string' ? children : undefined)}
      className={cn(badgeVariants({ variant }), cut && 'min-w-0 shrink justify-start', className)}
      {...props}
    >
      {cut ? <span className="min-w-0 truncate">{children}</span> : children}
    </Comp>
  )
}

export { Badge, badgeVariants }
