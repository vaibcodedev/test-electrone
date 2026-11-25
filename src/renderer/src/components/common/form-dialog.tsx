import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { NO_CHANGES } from '@/lib/edit-session'
import { FILL_REQUIRED } from '@/lib/form-validity'
import { useFormGate } from '@/hooks/use-form-gate'
import { FormAttemptContext } from '@/components/ui/field-control'
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
import { SubmitButton } from './submit-button'

/** Form values as one comparable string: key order is the order the dialog builds its payload in. */
const fingerprint = (values: unknown): string => JSON.stringify(values ?? null)

/**
 * Dialog with a form: title, optional description, fields, «Скасувати» + lime submit.
 * The submit is disabled — and Enter sends nothing — while a `required` field is empty or any field inside shows an
 * error (useFormGate reads the form itself: mark fields `Field required` from `requiredOf(schema)`), while the form
 * is `invalid` for a reason no field shows, while the request is `pending`, and — for a dialog that edits an existing
 * record (`values`) — until something differs from what it opened with. The reason is in the footer and in the
 * button's tooltip (docs/design-system.md → Формы).
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
  /**
   * Can't be sent for a reason the fields don't carry themselves (no project picked, a pair of dates). An empty
   * `required` field or a field showing an error blocks the submit without it.
   */
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
  // Empty required fields and fields showing an error block the submit by themselves: read from the form.
  const { attach, reason: gateReason, attempted, submit } = useFormGate(open)
  const reason = invalid
    ? (invalidReason ?? gateReason ?? FILL_REQUIRED)
    : (gateReason ?? (unchanged ? NO_CHANGES : undefined))
  const blocked = invalid || !!gateReason || unchanged || pending
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-130', className)}>
        <DialogHeader>
          <DialogTitle className="font-display text-heading">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          ref={attach}
          className="group/form flex flex-col gap-6"
          onSubmit={(e) =>
            submit(e, () => {
              if (!blocked) void onSubmit()
            })
          }
        >
          <FormAttemptContext.Provider value={attempted}>
            <FieldGroup className="gap-4">{children}</FieldGroup>
          </FormAttemptContext.Provider>
          <DialogFooter>
            {/* Always mounted: a live region that appears together with its text is not announced. */}
            <p
              id={reasonId}
              aria-live="polite"
              className={cn(
                'mr-auto self-center text-caption text-muted-foreground',
                // The generic phrase steps aside once a field says what is wrong.
                reason === FILL_REQUIRED &&
                  'group-has-aria-invalid/form:hidden group-has-data-[invalid=true]/form:hidden'
              )}
            >
              {reason}
            </p>
            <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            {/* The reason also on the button itself: reachable by Tab, not only read from the footer. */}
            <SubmitButton
              variant="lime"
              reason={reason || undefined}
              disabled={blocked}
              aria-describedby={reason ? reasonId : undefined}
            >
              {submitLabel}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
