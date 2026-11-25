import * as React from 'react'
import { cn } from '@/lib/utils'
import { useReadOnly } from '@/components/common/detail-mode-context'

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
        'flex field-sizing-content min-h-16 max-h-[min(50vh,26rem)] w-full min-w-0 max-w-full resize-none overflow-y-auto [overflow-wrap:anywhere] rounded-xl border border-input bg-foreground/[0.04] hover:border-foreground/40 px-3 py-2 text-body leading-relaxed transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/25',
        className,
        // Reading: still a Tab stop (to select and copy the value), so the focus stays visible as an outline.
        viewMode && 'min-h-0 border-transparent bg-transparent px-0 hover:border-transparent py-0.5 focus-visible:bg-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring rounded-md placeholder:text-transparent'
      )}
      {...props}
    />
  )
}

export { Textarea }
