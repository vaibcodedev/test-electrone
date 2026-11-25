import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

/** Colour dot of a job board (the colour comes from the user's data, so it is an inline style). */
export function BoardDot({ color, size = 'sm', className }: { color: string | null; size?: 'sm' | 'md'; className?: string }): ReactElement {
  return (
    <span
      aria-hidden
      className={cn('shrink-0 rounded-full', size === 'md' ? 'size-3' : 'size-2', className)}
      style={{ background: color ?? 'var(--muted-foreground)' }}
    />
  )
}

/** Dot + board name, truncated with «…» inside narrow cells and card footers. */
export function BoardLabel({ board, className }: { board: { name: string; color: string | null }; className?: string }): ReactElement {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <BoardDot color={board.color} />
      <span className="truncate">{board.name}</span>
    </span>
  )
}
