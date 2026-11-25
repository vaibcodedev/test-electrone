import { useState } from 'react'

/** Whether an overlay is open and how many times it has been opened. */
export interface OpenSession {
  open: boolean
  /** Bumps on every opening: 1 for the first, 2 for the next… 0 while it has never been open. */
  count: number
}

/**
 * The session after `open` is seen: a new one each time it turns true, the same object otherwise (so a render-time
 * update stops once it is applied). Closing keeps the count: the closing content stays as it was for the exit
 * motion (overlay-hold) and is replaced only on the next opening.
 */
export function nextOpenSession(prev: OpenSession, open: boolean): OpenSession {
  if (prev.open === open) return prev
  return { open, count: open ? prev.count + 1 : prev.count }
}

/** The number of the current opening of an overlay (render-time, docs/design-system.md → Сброс формы диалога). */
export function useOpenCount(open: boolean): number {
  const [session, setSession] = useState<OpenSession>(() => ({ open, count: open ? 1 : 0 }))
  const next = nextOpenSession(session, open)
  if (next !== session) setSession(next)
  return next.count
}

/**
 * Runs `reset` during the render in which `open` turns true: for a component that owns both the trigger and the
 * form state (a create popover). Reset on opening, never on closing — the closing form keeps its text through the
 * exit motion. `reset` may only set this component's own state.
 */
export function useResetOnOpen(open: boolean, reset: () => void): void {
  const [session, setSession] = useState<OpenSession>(() => ({ open, count: 0 }))
  const next = nextOpenSession(session, open)
  if (next !== session) {
    setSession(next)
    if (next.open) reset()
  }
}
