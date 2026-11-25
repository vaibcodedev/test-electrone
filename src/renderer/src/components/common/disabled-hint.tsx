import type { ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Says why a button is inactive. A disabled button gets no pointer events, so the focusable wrapper
 * carries the tooltip; with `reason` empty the button is rendered as is.
 */
export function DisabledHint({
  reason,
  children
}: {
  reason?: string
  children: ReactElement
}): ReactElement {
  if (!reason) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-full">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}
