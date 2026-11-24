import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

/** Pill buttons. `default` = ink (lime in dark), `lime` = primary call to action, `soft` = surface. */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] outline-none select-none active:translate-y-px focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/88',
        lime: 'bg-lime text-lime-foreground hover:brightness-95',
        soft: 'bg-surface text-foreground hover:bg-accent',
        outline: 'border border-input bg-transparent hover:bg-surface',
        ghost: 'text-foreground hover:bg-surface',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        link: 'h-auto rounded-none px-0 text-foreground underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 has-[>svg]:px-3.5',
        xs: "h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 px-3',
        lg: 'h-11 px-6 text-sm',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-11'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
