import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type FormEvent
} from 'react'
import { firstToFix, formBlockReason, isText } from '@/lib/form-validity'

export interface FormGate {
  /** The <form>'s ref callback (`ref={gate.attach}`). */
  attach: (el: HTMLFormElement | null) => void
  /** Why the submit is off right now («Заповніть: Назва», «Виправте поля з помилками»); undefined — it can be sent. */
  reason: string | undefined
  /** A submit was tried while something was missing: required fields show their error (FormAttemptContext). */
  attempted: boolean
  /**
   * Call from the form's onSubmit (`onSubmit={(e) => submit(e, send)}`): sends only when nothing is missing or wrong. Otherwise nothing is sent; the first field to
   * fix gets the focus and says what's wrong — Enter can't be disabled like the button.
   */
  submit: (e: FormEvent, send: () => void) => void
}

/**
 * Whether a create / save form may be sent, read from the form itself: every `required` control filled (spaces don't
 * count), the browser's own checks pass, and no field shows an error (`aria-invalid` / `data-invalid`). No form
 * collects its fields' validity by hand. The DOM is the store (useSyncExternalStore): re-read on input / change,
 * when a field marks itself invalid (MutationObserver) and after every commit (a value set by React — a reset, a
 * picker — fires no event). `active` false — not watching (a closed dialog).
 */
export function useFormGate(active = true): FormGate {
  const [form, setForm] = useState<HTMLFormElement | null>(null)
  const [attempted, setAttempted] = useState(false)
  // Who to tell after a commit: the store's own listeners.
  const [afterCommit] = useState(() => new Set<() => void>())
  const subscribe = useCallback(
    (changed: () => void): (() => void) => {
      afterCommit.add(changed)
      if (!form) return () => void afterCommit.delete(changed)
      // After the event, not during it: re-rendering a controlled input before React's own onChange ran put the old
      // value back into it, and the typed character was lost.
      let timer: ReturnType<typeof setTimeout> | undefined
      const later = (): void => {
        clearTimeout(timer)
        timer = setTimeout(changed, 0)
      }
      form.addEventListener('input', later)
      form.addEventListener('change', later)
      // A field's own state (a number out of range) shows as an attribute without re-rendering the form's owner.
      const observer = new MutationObserver(changed)
      observer.observe(form, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-invalid', 'data-invalid', 'required', 'disabled']
      })
      return () => {
        afterCommit.delete(changed)
        clearTimeout(timer)
        form.removeEventListener('input', later)
        form.removeEventListener('change', later)
        observer.disconnect()
      }
    },
    [form, afterCommit]
  )
  const read = useCallback(
    (): string | undefined => (form && active ? formBlockReason(form) : undefined),
    [form, active]
  )
  const reason = useSyncExternalStore(subscribe, read)
  useLayoutEffect(() => {
    for (const changed of afterCommit) changed()
  })
  // Enter in a field while the submit is off: the browser doesn't submit a form whose default button is disabled, so
  // the try is caught here — nothing is sent, the first field to fix gets the focus and says what's wrong.
  useEffect(() => {
    if (!form || !active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
      const t = e.target
      if (!(t instanceof HTMLInputElement) || !isText(t) || !read()) return
      setAttempted(true)
      firstToFix(form)?.focus()
    }
    form.addEventListener('keydown', onKey)
    return () => form.removeEventListener('keydown', onKey)
  }, [form, active, read])
  // A closed dialog forgets the try: the next opening starts quiet (reset during render, not in an effect).
  if (!active && attempted) setAttempted(false)
  const submit = useCallback(
    (e: FormEvent, send: () => void): void => {
      e.preventDefault()
      if (!read()) {
        // Sent: the form usually resets for the next entry, which must not open in red.
        setAttempted(false)
        return send()
      }
      setAttempted(true)
      if (form) firstToFix(form)?.focus()
    },
    [form, read]
  )
  return { attach: setForm, reason, attempted, submit }
}
