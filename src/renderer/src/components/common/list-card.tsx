import type { ReactElement, ReactNode } from 'react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** A card with a short list (dashboard, «Знання»): readable title, an optional action on the right. */
export function ListCard({
  title,
  action,
  children,
  className
}: {
  title: string
  /** Usually a `subtle size="xs"` transition to the section. */
  action?: ReactNode
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Empty list inside a card: one sentence on how it fills up (docs/design-system.md → Пустые состояния). */
export function CardEmptyText({ children }: { children: ReactNode }): ReactElement {
  return <p className="text-body leading-relaxed text-muted-foreground">{children}</p>
}
