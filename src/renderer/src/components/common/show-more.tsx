import { useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Long text in a record being read, folded to `collapsedClass` with «Показати повністю» / «Згорнути» under it
 * (a link button, no inner scroll). Without `enabled` the text shows as is.
 */
export function ShowMore({
  enabled,
  collapsedClass,
  moreLabel = 'Показати повністю',
  children
}: {
  enabled: boolean
  collapsedClass: string
  moreLabel?: string
  children: ReactNode
}): ReactElement {
  const [open, setOpen] = useState(false)
  if (!enabled) return <>{children}</>
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div className={cn('w-full min-w-0', !open && collapsedClass)}>{children}</div>
      <Button variant="link" size="xs" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Згорнути' : moreLabel}
      </Button>
    </div>
  )
}
