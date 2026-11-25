import type { ReactElement, ReactNode } from 'react'

/** Record view: a definition list of label → value rows; empty values are skipped by the caller. */
export function InfoList({ children }: { children: ReactNode }): ReactElement {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-body">
      {children}
    </dl>
  )
}

/** A long value is cut with «…» and its full text is in the tooltip (text values; pass a string). */
export function InfoRow({
  label,
  children,
  actions
}: {
  label: string
  children: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span
          className="selectable min-w-0 truncate"
          title={typeof children === 'string' ? children : undefined}
        >
          {children}
        </span>
        {actions && <span className="ml-auto flex shrink-0 items-center">{actions}</span>}
      </dd>
    </>
  )
}
