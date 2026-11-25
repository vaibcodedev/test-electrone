import type { FormEvent, ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'

/**
 * Dialog with a form: title, optional description, fields, «Скасувати» + lime submit.
 * The submit is disabled while the form is `invalid` or the request is `pending`, and Enter
 * doesn't submit twice either (docs/design-system.md → Формы: без двойной отправки).
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  submitLabel,
  cancelLabel = 'Скасувати',
  onSubmit,
  invalid = false,
  pending = false,
  invalidReason,
  className
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  submitLabel: string
  cancelLabel?: string
  onSubmit: () => void | Promise<unknown>
  /** Required field empty, value out of range, bad link… — the reason is shown at the field. */
  invalid?: boolean
  /** The mutation is running. */
  pending?: boolean
  /**
   * Why the submit is disabled when no field shows it (an empty required name): «Вкажіть назву дошки».
   * Shown left of the buttons while `invalid` (docs/design-system.md → Кнопки).
   */
  invalidReason?: string
  /** Width of the dialog, e.g. `sm:max-w-[560px]`. */
  className?: string
}): ReactElement {
  const blocked = invalid || pending
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-[520px]', className)}>
        <DialogHeader>
          <DialogTitle className="font-display text-heading">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (!blocked) void onSubmit()
          }}
        >
          <FieldGroup className="gap-4">{children}</FieldGroup>
          <DialogFooter>
            {invalid && invalidReason && (
              <p className="mr-auto self-center text-caption text-muted-foreground" aria-live="polite">
                {invalidReason}
              </p>
            )}
            <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button type="submit" variant="lime" disabled={blocked}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
