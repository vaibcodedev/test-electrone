import type { ReactElement } from 'react'
import { X } from 'lucide-react'
import { LoadError } from '@/features/route-error'
import { Card } from '@/components/ui/card'
import { IconAction } from './icon-action'

/**
 * A record that failed to load, inside the place it would have opened: ✕ (Esc) and «Повторити».
 * `pane` — beside a list (MasterDetail), drawn as a card like DetailPane; without it — inside a Sheet or Dialog.
 */
export function RecordLoadError({
  onRetry,
  onClose,
  pane
}: {
  onRetry: () => void
  onClose: () => void
  pane?: boolean
}): ReactElement {
  const body = (
    <div role="alert" className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end border-b border-border px-4 py-2.5">
        <IconAction size="icon-sm" label="Закрити" shortcut="Esc" data-close-detail onClick={onClose}>
          <X />
        </IconAction>
      </div>
      <div className="min-h-0 flex-1">
        <LoadError title="Не вдалося відкрити запис" onRetry={onRetry} />
      </div>
    </div>
  )
  if (!pane) return body
  return (
    <Card className="min-h-0 flex-1 animate-pane gap-0 overflow-hidden border border-foreground/12 bg-card py-0 shadow-[0_1px_3px_-1px_rgb(0_0_0/0.22)]">
      {body}
    </Card>
  )
}
