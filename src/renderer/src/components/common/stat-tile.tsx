import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type StatTone = 'surface' | 'ink' | 'lime'

/** Secondary text colour on each tile background. */
const MUTED: Record<StatTone, string> = {
  surface: 'text-muted-foreground',
  ink: 'text-ink-muted',
  lime: 'text-lime-foreground/70'
}

/**
 * Dashboard-style stat tile: label (`text-body font-medium`, muted) → big number
 * (`font-display text-headline tabular-nums`) → optional hint (docs/design-system.md → Списки и
 * плитки). `value` is any node: a string, `MoneyValue`, `MoneyLines compact` (it sets its own size).
 * One `ink` or `lime` tile per row at most — it is the row's accent.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'surface',
  className
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: StatTone
  className?: string
}): ReactElement {
  return (
    <Card
      className={cn(
        'min-h-[118px] gap-2',
        tone === 'ink' && 'bg-ink text-ink-foreground',
        tone === 'lime' && 'bg-lime text-lime-foreground',
        className
      )}
    >
      <CardHeader>
        <CardDescription className={cn('text-body font-medium', MUTED[tone])}>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="font-display text-headline leading-none tabular-nums">{value}</div>
        {hint && <div className={cn('mt-1.5 text-caption', MUTED[tone])}>{hint}</div>}
      </CardContent>
    </Card>
  )
}

/**
 * Small «label + number» cell inside a record (word, interview question): a compact `Card`, the
 * explanation in a tooltip (the cell is focusable, so the tooltip opens from the keyboard too).
 */
export function StatCell({ label, value, hint }: { label: string; value: ReactNode; hint: string }): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="cursor-help gap-0.5 rounded-2xl px-3 py-2.5" tabIndex={0}>
          <div className="text-meta text-muted-foreground">{label}</div>
          <div className="text-lead font-medium tabular-nums">{value}</div>
        </Card>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{hint}</TooltipContent>
    </Tooltip>
  )
}
