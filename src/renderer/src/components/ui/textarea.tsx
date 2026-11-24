import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // field-sizing grows height only: min-w-0/max-w-full + overflow-wrap stop a long unbroken word from widening the parent.
        'flex field-sizing-content min-h-16 w-full min-w-0 max-w-full resize-none [overflow-wrap:anywhere] rounded-xl border border-transparent bg-surface px-3 py-2 text-body leading-relaxed transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring/60 focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/25',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
