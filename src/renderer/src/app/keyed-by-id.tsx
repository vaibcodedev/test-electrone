import { Fragment, type ReactElement, type ReactNode } from 'react'
import { useParams } from 'react-router'

/**
 * Remounts a record page when only :id changes (/projects/A → /projects/B via a link or Ctrl+K):
 * otherwise edit mode, its snapshot and pending autosaves of A carried over to B.
 */
export function KeyedById({ children }: { children: ReactNode }): ReactElement {
  const { id } = useParams()
  return <Fragment key={id}>{children}</Fragment>
}
