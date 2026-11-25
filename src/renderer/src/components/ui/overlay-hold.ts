import { createContext, useContext, useState } from 'react'

/**
 * `open` of an overlay root (Dialog, AlertDialog, Sheet, Popover) for its content; `undefined` — the root keeps
 * its own state (a trigger opens it), and nothing is held.
 */
export const OverlayOpenContext = createContext<boolean | undefined>(undefined)

/**
 * What the content of a closing overlay shows during its exit animation. Radix keeps the content mounted until
 * the animation ends, but by then the parent has usually cleared the state the body was built from (`open={!!x}`
 * with the body from `x`, a search or a selection reset on close): the body went blank, collapsed or switched to
 * «new» while it faded out. While the root is closed, the content keeps the children of its last open render.
 */
export function useHeldWhileClosing<T>(children: T): T {
  const open = useContext(OverlayOpenContext)
  const [held, setHeld] = useState(children)
  // Adjusting state during render (react.dev «You might not need an effect»): no frame shows the cleared body.
  if (open !== false && held !== children) setHeld(children)
  return open === false ? held : children
}
