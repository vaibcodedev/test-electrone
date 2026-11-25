import { useEffect, useState, type KeyboardEvent } from 'react'
import { useDetailMode } from '@/components/common/detail-mode-context'

/** Esc closes an inline form; a key pressed in its portaled select/calendar is left to them. */
export const escapeCloses =
  (close: () => void) =>
  (e: KeyboardEvent<HTMLFormElement>): void => {
    if (e.key !== 'Escape' || !e.currentTarget.contains(e.target as Node)) return
    e.stopPropagation()
    close()
  }

/**
 * Open state of an inline form that belongs to edit mode («+ Етап», «Вручну», a row's pencil): leaving
 * edit mode (Esc, «Скасувати») closes it, otherwise it stayed submittable in view mode. While it is open the
 * record holds «Зберегти» (`holdOpen`): saving would drop the typed sum or login and still say «Збережено», so
 * the person is asked to add or cancel `what` («етап», «доступ») first.
 * Reset during render (docs/design-system.md → Сброс формы), so it never shows for a frame in view mode.
 * The form's submit button is subtle: the form sits in a surface card (docs/design-system.md §8).
 */
export function useInlineForm(what: string): [boolean, (open: boolean) => void] {
  const { editing, holdOpen } = useDetailMode()
  const [open, setOpen] = useState(false)
  if (!editing && open) setOpen(false)
  const held = open && editing
  useEffect(() => (held ? holdOpen?.(what) : undefined), [held, holdOpen, what])
  return [open, setOpen]
}
