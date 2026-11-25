import { useState, type KeyboardEvent } from 'react'
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
 * edit mode (Esc, «Скасувати», «Зберегти») closes it, otherwise it stayed submittable in view mode.
 * Reset during render (docs/design-system.md → Сброс формы), so it never shows for a frame in view mode.
 */
export function useInlineForm(): [boolean, (open: boolean) => void] {
  const { editing } = useDetailMode()
  const [open, setOpen] = useState(false)
  if (!editing && open) setOpen(false)
  return [open, setOpen]
}
