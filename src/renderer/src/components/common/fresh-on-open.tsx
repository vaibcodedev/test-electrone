import type { ComponentType, ReactElement } from 'react'
import { useOpenCount } from '@/hooks/use-open-session'

/**
 * A dialog that opens clean every time: wrap the dialog component once where it is defined
 * (`export const ClientDialog = freshOnOpen(function ClientDialog(…) {…})`) and it is created anew on each opening —
 * a create form opens empty, an edit form with the record's current values, never with what was typed last time and
 * left by «Скасувати», ✕, Esc or a click outside. Its own state goes with it: typed text, picks, touched fields,
 * errors, a submit try (useFormGate). Created on OPENING, not on closing: the closing dialog keeps its content for
 * the exit motion (components/ui/overlay-hold.ts).
 * - `open` — how to read «open» from the props (default: the `open` prop);
 * - `identity` — a value that means another form while it stays open (the event being edited).
 */
export function freshOnOpen<P extends object>(
  Dialog: ComponentType<P>,
  options: {
    open?: (props: P) => boolean
    identity?: (props: P) => string | number | null | undefined
  } = {}
): (props: P) => ReactElement {
  const isOpen = options.open ?? ((props: P) => !!(props as { open?: boolean }).open)
  function Fresh(props: P): ReactElement {
    const count = useOpenCount(isOpen(props))
    const id = options.identity?.(props) ?? ''
    return <Dialog key={`${count}:${id}`} {...props} />
  }
  Fresh.displayName = `Fresh(${Dialog.displayName ?? Dialog.name})`
  return Fresh
}
