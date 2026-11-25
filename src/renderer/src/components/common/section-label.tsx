import type { ReactElement, ReactNode } from 'react'

/** Section title used in asides and editors («Мітки», «Зв’язки», «Файли»), with an optional action on the right. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <h3 className="text-caption font-semibold text-muted-foreground">{children}</h3>
      {action}
    </div>
  )
}
