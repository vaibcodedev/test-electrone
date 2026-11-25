import { useRef, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'

/**
 * Confirmation before an irreversible or cascading action (a file off the disk, a record with its children).
 * The trigger can be an `IconAction`: Slot props reach its Button. Without `children` it is controlled by
 * `open` / `onOpenChange` — for an item of a ⋯ menu, which unmounts as the menu closes.
 * tone="destructive" (default): red action with a trash icon — never lime (lime means "go ahead").
 * Focus starts on «Скасувати», the safe choice.
 */
export function Confirm({
  children,
  title,
  description,
  confirmLabel = 'Видалити',
  tone = 'destructive',
  onConfirm,
  open,
  onOpenChange
}: {
  children?: ReactNode
  title: string
  description?: ReactNode
  confirmLabel?: string
  tone?: 'destructive' | 'default'
  onConfirm: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const setOpen = onOpenChange ?? setInner
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent
        className="rounded-3xl"
        onOpenAutoFocus={(e) => {
          // Chromium shows the ring only when the dialog was opened from the keyboard.
          e.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <AlertDialogHeader>
          {/* A file name or title without spaces wraps instead of leaving the dialog. */}
          <AlertDialogTitle className="[overflow-wrap:anywhere]">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="[overflow-wrap:anywhere]">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} variant="soft">
            Скасувати
          </AlertDialogCancel>
          <AlertDialogAction
            // Variant, not className: asChild merges classes without tailwind-merge, so bg-primary (lime) won.
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            {tone === 'destructive' && <Trash2 />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
