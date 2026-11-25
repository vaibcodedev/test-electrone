import { createContext, useContext } from 'react'

/**
 * A labelled field → its control (Input, Textarea, SelectTrigger): the id of the message under it (error or hint)
 * and the error state, for aria-describedby / aria-invalid. Only the control the label points at (`id` = the
 * label's htmlFor) takes them, so a search box in a popover opened from the field is never marked invalid. The
 * control's own aria-* props win.
 */
export type FieldControl = { id?: string; describedBy?: string; invalid?: boolean }

const FieldControlContext = createContext<FieldControl>({})

export const FieldControlProvider = FieldControlContext.Provider

export function useFieldControl(id: string | undefined): { describedBy?: string; invalid?: true } {
  const field = useContext(FieldControlContext)
  if (!id || field.id !== id) return {}
  return { describedBy: field.describedBy, invalid: field.invalid || undefined }
}
