import { createContext, useContext, useEffect } from 'react'

/**
 * A labelled field → its control (Input, Textarea, SelectTrigger): the id of the message under it (error or hint),
 * the error state for aria-describedby / aria-invalid, and a channel for the control's length so the field can
 * show «N / max» next to its label. Only the control the label points at (`id` = the label's htmlFor) takes part,
 * so a search box in a popover opened from the field is never marked invalid or counted. The control's own aria-*
 * props win.
 */
export type FieldControl = {
  id?: string
  describedBy?: string
  invalid?: boolean
  /** Must be filled (`Field required`, from `requiredOf(schema)`): the control gets `required`. */
  required?: boolean
  /** The control reports its text length and limit (maxLength). */
  count?: (length: number, max: number) => void
}

const FieldControlContext = createContext<FieldControl>({})

export const FieldControlProvider = FieldControlContext.Provider

export function useFieldControl(id: string | undefined): {
  describedBy?: string
  invalid?: true
  required?: true
} {
  const field = useContext(FieldControlContext)
  if (!id || field.id !== id) return {}
  return {
    describedBy: field.describedBy,
    invalid: field.invalid || undefined,
    required: field.required || undefined
  }
}

/**
 * The form tried to submit while something was missing (useFormGate, FormDialog): required fields left empty show
 * their error now, not only once touched — a pristine form never opens in red.
 */
export const FormAttemptContext = createContext(false)

/** A text control with a limit tells its field how much is used: every limited field shows its limit. */
export function useFieldCount(
  id: string | undefined,
  length: number,
  max: number | undefined
): void {
  const field = useContext(FieldControlContext)
  const report = id && field.id === id ? field.count : undefined
  useEffect(() => {
    if (report && max) report(length, max)
  }, [report, length, max])
}
