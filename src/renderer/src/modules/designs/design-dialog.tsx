import { useState, type ReactElement } from 'react'
import { guardSheet, useModeRef } from '@/components/common/detail-mode'
import { isEditableTarget } from '@/lib/dom'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DesignDetail, type DesignNav } from './design-detail'

/**
 * A design opens over the gallery, not beside it: a picture needs the width, and a side pane left the gallery
 * two narrow columns. The record is the same DetailPane (view → «Редагувати», the aside with the palette);
 * ← / → step through the gallery while reading, Esc leaves editing first and then closes (guardSheet).
 */
export function DesignDialog({
  id,
  ids,
  onOpen,
  onClose
}: {
  /** ?open= — null when closed. */
  id: string | null
  /** The gallery's order, for ← / →. */
  ids: string[]
  onOpen: (id: string) => void
  onClose: () => void
}): ReactElement {
  const modeRef = useModeRef()
  // Built per event: the ref is read when Esc or a click outside happens, never during render.
  const guard = (): ReturnType<typeof guardSheet> => guardSheet(modeRef, onClose)
  // The last design stays while the dialog fades out: content that vanished first made the exit a blank flash.
  const [shown, setShown] = useState(id)
  if (id && id !== shown) setShown(id)

  const index = shown ? ids.indexOf(shown) : -1
  const nav: DesignNav = {
    prev: index > 0 ? ids[index - 1] : null,
    next: index >= 0 && index < ids.length - 1 ? ids[index + 1] : null,
    go: (to) => {
      // Editing holds the record: leaving it is «Зберегти» / «Скасувати», not an arrow.
      if (to && !modeRef.current?.editing) onOpen(to)
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => guard().onOpenChange(o)}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => guard().onEscapeKeyDown(e)}
        onKeyDown={(e) => {
          if (e.altKey || e.ctrlKey || e.metaKey || isEditableTarget(e.target)) return
          if (e.key === 'ArrowLeft' && nav.prev) {
            e.preventDefault()
            nav.go(nav.prev)
          } else if (e.key === 'ArrowRight' && nav.next) {
            e.preventDefault()
            nav.go(nav.next)
          }
        }}
        className="flex h-[min(88vh,880px)] w-[min(94vw,1240px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Дизайн</DialogTitle>
        {shown && (
          <DesignDetail key={shown} id={shown} onClose={onClose} modeRef={modeRef} nav={nav} />
        )}
      </DialogContent>
    </Dialog>
  )
}
