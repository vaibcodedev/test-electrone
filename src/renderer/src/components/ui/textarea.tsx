import * as React from 'react'
import { cn } from '@/lib/utils'
import { useReadOnly } from '@/components/common/detail-mode'

function Textarea({ className, readOnly, ...props }: React.ComponentProps<'textarea'>) {
  const viewMode = useReadOnly()
  const empty = props.value === '' || props.value === undefined || props.value === null
  return (
    <textarea
      readOnly={readOnly || viewMode}
      data-view={viewMode || undefined}
      data-empty={viewMode && empty ? true : undefined}
      data-slot="textarea"
      className={cn(
        // Grows with content up to ~26rem (or half the window), then scrolls inside. field-sizing grows height only: min-w-0/max-w-full + overflow-wrap stop a long unbroken word from widening the parent.
        'flex field-sizing-content min-h-16 max-h-[min(50vh,26rem)] w-full min-w-0 max-w-full resize-none overflow-y-auto [overflow-wrap:anywhere] rounded-xl border border-input bg-foreground/[0.04] hover:border-foreground/25 px-3 py-2 text-body leading-relaxed transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring/60 focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/25',
        className,
        viewMode && 'min-h-0 border-transparent bg-transparent px-0 focus-visible:border-transparent hover:border-transparent py-0.5 focus-visible:bg-transparent focus-visible:ring-0 placeholder:text-transparent'
      )}
      {...props}
    />
  )
}

export { Textarea }
