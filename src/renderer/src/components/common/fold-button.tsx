import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import type { Fold } from '@/hooks/use-fold'

/** «Показати ще N» / «Згорнути» under a folded list; nothing when the list fits. */
export function FoldButton({ fold }: { fold: Fold<unknown> }): ReactElement | null {
  if (!fold.foldable) return null
  return (
    <Button
      variant="link"
      size="xs"
      className="self-start"
      aria-expanded={fold.all}
      onClick={fold.toggle}
    >
      {fold.all ? 'Згорнути' : `Показати ще ${fold.rest}`}
    </Button>
  )
}
