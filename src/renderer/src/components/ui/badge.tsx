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
        // /8, not /12 like the other statuses: at /12 the dark-theme red on surface drops to 4.4:1.
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
     * Long text ends with «…» and the badge may shrink in a flex row; the text children become the `title`.
     * The ellipsis needs an inner span: `truncate` on the inline-flex badge itself cut the text mid-word.
     * A leading icon stays outside the text span, so it keeps its size and gap and is never cut off.
     */
    truncate?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'span'
  if (!truncate || asChild) {
    return (
      <Comp
        data-slot="badge"
        title={title}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      >
        {children}
      </Comp>
    )
  }
  const parts = React.Children.toArray(children)
  const lead: React.ReactNode[] = []
  while (parts.length && React.isValidElement(parts[0])) lead.push(parts.shift())
  const text = parts.filter((p) => typeof p === 'string' || typeof p === 'number').join('')
  return (
    <Comp
      data-slot="badge"
      title={title ?? (text || undefined)}
      className={cn(badgeVariants({ variant }), 'min-w-0 shrink justify-start', className)}
      {...props}
    >
      {lead}
      <span className="min-w-0 truncate">{parts}</span>
    </Comp>
  )
}

export { Badge, badgeVariants }
