import type { ComponentType, ReactElement } from 'react'
import { Badge } from '@/components/ui/badge'

/**
 * «Відпустіть, щоб…» over a drop target while files are dragged over it. The parent is `relative` and
 * spreads `useDroppedFiles(...).props`; pointer events pass through, so the drop lands on the parent.
 */
export function DropOverlay({
  show,
  label,
  icon: Icon
}: {
  show: boolean
  label: string
  icon: ComponentType<{ className?: string }>
}): ReactElement | null {
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-ring bg-lime-soft/80 backdrop-blur-sm">
      <Badge variant="ink" className="h-10 gap-2 px-5 text-lead [&>svg]:size-4">
        <Icon className="text-ink-accent" /> {label}
      </Badge>
    </div>
  )
}
