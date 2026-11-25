import type { ReactElement } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/common/page'

/** A GitHub tab that failed to load: what happened and «Повторити», in the language of LoadError. */
export function GithubLoadError({
  error,
  onRetry
}: {
  error: unknown
  onRetry: () => void
}): ReactElement {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Не вдалося завантажити"
      hint={(error as Error).message}
      cta={{ label: 'Повторити', icon: RefreshCw, onClick: onRetry }}
    />
  )
}
