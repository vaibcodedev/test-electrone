import type { ReactElement } from 'react'
import { FlaskConical } from 'lucide-react'
import { isSandbox } from '@/lib/profile'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * «Тестовий режим» in the title bar, on every screen. Ink, not a tinted status: warn/12 on the sand frame is
 * 3.97:1. Its name is the visible text; the tooltip is the description (no aria-label — label in name).
 */
export function SandboxBadge({ className }: { className?: string }): ReactElement | null {
  if (!isSandbox) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="ink" tabIndex={0} data-sandbox-badge="" className={cn('no-drag gap-1.5 px-3 py-1', className)}>
          <FlaskConical className="text-ink-accent" aria-hidden />
          Тестовий режим
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Окремі тестові дані. Ваша основна база закрита й не змінюється.</TooltipContent>
    </Tooltip>
  )
}
