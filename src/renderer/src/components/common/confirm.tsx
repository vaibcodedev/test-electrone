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
 * Wraps a trigger with a confirmation dialog. Use for irreversible actions only.
 * tone="destructive" (default): red action with a trash icon — never lime (lime means "go ahead").
 * Focus starts on «Скасувати» (the safe choice) without the keyboard focus ring.
 */
export function Confirm({
  children,
  title,
  description,
  confirmLabel = 'Видалити',
  tone = 'destructive',
  onConfirm
}: {
  children: ReactNode
  title: string
  description?: ReactNode
  confirmLabel?: string
  tone?: 'destructive' | 'default'
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent
        className="rounded-3xl"
        onOpenAutoFocus={(e) => {
          // Focus the safe button, but don't paint a keyboard focus ring on a mouse-opened dialog.
          e.preventDefault()
          cancelRef.current?.focus({ focusVisible: false } as FocusOptions)
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
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
