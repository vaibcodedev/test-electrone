import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Local editable copy of a server value that saves itself after the user stops typing.
 * - `value` is the server state; when it changes (other window/refetch) and there are no
 *   pending local edits, the draft follows it.
 * - Pending edits are flushed on unmount so nothing is lost when switching items.
 */
export function useAutosave<T>(value: T, save: (next: T) => void, delay = 600): [T, (next: T) => void, boolean] {
  const [draft, setDraft] = useState(value)
  const pending = useRef<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  useEffect(() => {
    if (pending.current === null) setDraft(value)
  }, [value])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current !== null) {
      const next = pending.current
      pending.current = null
      saveRef.current(next)
    }
  }, [])

  useEffect(() => flush, [flush])

  const update = useCallback(
    (next: T) => {
      setDraft(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush]
  )

  return [draft, update, pending.current !== null]
}
