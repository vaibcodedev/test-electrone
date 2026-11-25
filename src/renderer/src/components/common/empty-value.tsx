import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A phrase in place of an empty stat value («ще немає оплат»): a zero would read as data
 * (docs/design-system.md → Плитка статистики). Resets the stat's display font and size; on an ink tile pass
 * `className="text-ink-muted"` (a StatTile itself takes `empty`).
 */
export function EmptyValue({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <span
      className={cn(
        'font-sans text-body font-normal tracking-normal text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}
