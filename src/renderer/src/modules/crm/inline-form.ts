import type { KeyboardEvent } from 'react'

/** Esc closes an inline form; a key pressed in its portaled select/calendar is left to them. */
export const escapeCloses =
  (close: () => void) =>
  (e: KeyboardEvent<HTMLFormElement>): void => {
    if (e.key !== 'Escape' || !e.currentTarget.contains(e.target as Node)) return
    e.stopPropagation()
    close()
  }
