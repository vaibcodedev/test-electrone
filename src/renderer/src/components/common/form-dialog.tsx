import {
  useCallback,
  useId,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { cn } from '@/lib/utils'
import { NO_CHANGES } from '@/lib/edit-session'
import { useHoldWhileInvalid } from '@/hooks/use-hold-while-invalid'
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

/** Form values as one comparable string: key order is the order the dialog builds its payload in. */
const fingerprint = (values: unknown): string => JSON.stringify(values ?? null)

/**
 * Dialog with a form: title, optional description, fields, «Скасувати» + lime submit.
 * The submit is disabled while the form is `invalid`, while any field inside shows an error (`aria-invalid` /
 * `data-invalid` — a number out of range, a bad link), while the request is `pending`, and — for a dialog that edits
 * an existing record (`values`) — until something differs from what it opened with. Enter doesn't submit twice
 * either (docs/design-system.md → Формы: без двойной отправки).
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
  values,
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
   * Shown left of the buttons while `invalid` (docs/design-system.md → Кнопки). Without it the footer says
   * «Заповніть обов’язкові поля», and only while no field shows its own error.
   */
  invalidReason?: string
  /**
   * Editing an existing record: what the form would save (the same object `onSubmit` sends). The values it had when
   * the dialog opened are the baseline — while nothing differs, the submit is off with «Змін немає». Leave it out
   * in a dialog that creates something.
   */
  values?: unknown
  /** Width of the dialog, e.g. `sm:max-w-140`. */
  className?: string
}): ReactElement {
  const reasonId = useId()
  // The baseline is taken when the dialog opens (during render, docs/design-system.md → Сброс формы диалога).
  const [wasOpen, setWasOpen] = useState(open)
  const [baseline, setBaseline] = useState(() => (open ? fingerprint(values) : null))
  if (open !== wasOpen) {
    setWasOpen(open)
    setBaseline(open ? fingerprint(values) : null)
  }
  const unchanged = values !== undefined && baseline !== null && fingerprint(values) === baseline
  // A field that shows an error blocks the submit by itself: no dialog has to collect every field's validity.
  const [form, setForm] = useState<HTMLFormElement | null>(null)
  const [fieldError, setFieldError] = useState(false)
  const holdError = useCallback(() => {
    setFieldError(true)
    return () => setFieldError(false)
  }, [])
  useHoldWhileInvalid(form, open ? holdError : undefined)
  const blocked = invalid || fieldError || unchanged || pending
  const reason = invalid
    ? (invalidReason ?? 'Заповніть обов’язкові поля')
    : unchanged
      ? NO_CHANGES
      : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-130', className)}>
        <DialogHeader>
          <DialogTitle className="font-display text-heading">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          ref={setForm}
          className="group/form flex flex-col gap-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (!blocked) void onSubmit()
          }}
        >
          <FieldGroup className="gap-4">{children}</FieldGroup>
          <DialogFooter>
            {/* Always mounted: a live region that appears together with its text is not announced. */}
            <p
              id={reasonId}
              aria-live="polite"
              className={cn(
                'mr-auto self-center text-caption text-muted-foreground',
                // The generic phrase steps aside once a field says what is wrong.
                invalid &&
                  !invalidReason &&
                  'group-has-aria-invalid/form:hidden group-has-data-[invalid=true]/form:hidden'
              )}
            >
              {reason}
            </p>
            <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant="lime"
              disabled={blocked}
              aria-describedby={reason ? reasonId : undefined}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
