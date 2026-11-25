import type { ReactElement } from 'react'
import { RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/common/page'
import { Button } from '@/components/ui/button'

/** A GitHub tab that failed to load: what happened and «Повторити». */
export function GithubLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }): ReactElement {
  return (
    <EmptyState
      title="Не вдалося завантажити"
      hint={(error as Error).message}
      action={
        <Button variant="soft" onClick={onRetry}>
          <RefreshCw /> Повторити
        </Button>
      }
    />
  )
}
