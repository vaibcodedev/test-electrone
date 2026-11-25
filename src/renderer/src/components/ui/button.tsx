import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * Pill buttons. `default` = ink (lime in dark), `lime` = primary call to action, `soft` = surface.
 * Focus is the global `:focus-visible` outline (globals.css) with a 2px gap: a ring flush with the fill was
 * ≈1:1 on a lime button in the dark theme and vanished in forced colours.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-body font-medium whitespace-nowrap transition-[background-color,color,transform] select-none active:translate-y-px disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Disabled filled buttons lose the fill and get a thin outline: clearly "not now", never mistaken
        // for a neighbouring soft button (e.g. "Скасувати" next to a disabled "Імпортувати"). An inset ring,
        // not a border: a border grew the button by 2px, and Chromium's dashes broke unevenly on the pill's
        // corners, so the button looked cut off.
        default:
          'bg-primary text-primary-foreground hover:bg-primary/88 disabled:bg-transparent disabled:text-muted-foreground disabled:inset-ring disabled:inset-ring-foreground/20',
        lime: 'bg-lime text-lime-foreground hover:brightness-95 disabled:bg-transparent disabled:text-muted-foreground disabled:inset-ring disabled:inset-ring-foreground/20',
        // State layers, not layer colours: soft, subtle, outline and ghost lay the text colour over whatever is
        // under them — 6% at rest, 10% on hover (docs/design-system.md → Наведення). A solid bg-card/bg-surface
        // was darker than a hovered tile in the dark theme and showed as a hole; a tint reads the same on a card,
        // a tile and a hovered tile, in both themes. On a card, 6% ≈ surface, so soft looks as before.
        // Disabled the same way as the filled ones: a grey surface with grey text still read as clickable.
        soft: 'bg-foreground/6 text-foreground hover:bg-foreground/10 disabled:bg-transparent disabled:text-muted-foreground disabled:inset-ring disabled:inset-ring-foreground/20',
        outline: 'border border-input bg-transparent hover:bg-foreground/6 disabled:opacity-50',
        // Tinted hover: ghost buttons mostly sit on bg-surface cards, where hover:bg-surface was invisible.
        ghost: 'text-foreground hover:bg-foreground/[0.07] disabled:opacity-40',
        // Navigation from a card ("Усі бібліотеки", "Календар"): the same state layer as soft, a step lighter at rest.
        subtle: 'bg-foreground/6 text-foreground hover:bg-foreground/10 disabled:opacity-50',
        // Dangerous action: solid red, its own text colour (white is 3:1 on the dark-theme red), calm hover;
        // its focus outline is red too (never lime).
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/88 focus-visible:outline-destructive disabled:opacity-50 [&_svg]:text-destructive-foreground',
        // Trigger that looks like a field (DatePicker, Combobox): the input's border and tint; focus stays the
        // global outline.
        field:
          'justify-start rounded-xl border border-input bg-foreground/4 font-normal text-foreground hover:border-foreground/40 hover:bg-foreground/4 aria-invalid:border-destructive disabled:opacity-50',
        // On a code block (ink in both themes): «Форматувати», copy code.
        code: 'bg-(--code-control) text-(--code-fg) hover:bg-(--code-control-hover) disabled:opacity-50',
        link: 'h-auto rounded-none px-0 text-foreground underline decoration-current/30 underline-offset-4 hover:decoration-current disabled:opacity-50'
      },
      size: {
        default: 'h-9 px-4 has-[>svg]:px-3.5',
        xs: "h-6 gap-1 px-2.5 text-caption [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 px-3',
        lg: 'h-11 px-6 text-body',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-11'
      }
    },
    // Sizes add padding/height; a link must stay flush with the text around it.
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 has-[>svg]:px-0' }],
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
    // Service attributes after the props: a Radix trigger (asChild) merges its own data-slot in, and the
    // detail-mode CSS («one accent while editing») must still see data-slot="button".
    <Comp
      {...props}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
    />
  )
}

export { Button, buttonVariants }
