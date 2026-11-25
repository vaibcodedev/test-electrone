import { useCallback, useEffect, useRef, useState } from 'react'

/** Flushers of every mounted autosave field. */
const flushers = new Set<() => void>()
let saving = 0

/** true while an autosave field hands its value to `save`: mutations started right now are autosaves. */
export function isAutosaving(): boolean {
  return saving > 0
}

/**
 * Saves all pending edits right now. Called before creating a record: otherwise the editor that
 * closes after the create would save later and jump above the new record in "recently changed" lists.
 */
export function flushAllAutosaves(): void {
  for (const f of flushers) f()
}

/**
 * Local editable copy of a server value that saves itself after the user stops typing.
 * - `value` is the server state; when it changes (other window/refetch) and there are no
 *   pending local edits, the draft follows it.
 * - Pending edits are flushed on unmount so nothing is lost when switching items.
 */
export function useAutosave<T>(value: T, save: (next: T) => void, delay = 600): [T, (next: T) => void] {
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
      saving++
      try {
        saveRef.current(next)
      } finally {
        saving--
      }
    }
  }, [])

  useEffect(() => {
    flushers.add(flush)
    return () => {
      flushers.delete(flush)
      flush()
    }
  }, [flush])

  const update = useCallback(
    (next: T) => {
      setDraft(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush]
  )

  return [draft, update]
}
