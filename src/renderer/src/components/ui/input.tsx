import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-xl border border-transparent bg-surface px-3 py-1 text-[13px] transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground/80 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring/60 focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        '[&[type=datetime-local]]:pr-2 [&[type=date]]:pr-2 dark:[color-scheme:dark]',
        className
      )}
      {...props}
    />
  )
}

export { Input }
