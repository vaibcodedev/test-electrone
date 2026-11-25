import { useCallback, useEffect, useRef, useState } from 'react'
import { editSignal } from '@/lib/edit-session'

/** Flushers of every mounted autosave field. */
const flushers = new Set<() => void>()
/** Draft resetters of every mounted autosave field (`revert` — after «Скасувати», else after leaving edit mode). */
const resetters = new Set<(revert: boolean) => void>()
/** Fields holding a value that hasn't gone out yet. */
const waiting = new Set<object>()
let saving = 0
/** Mutations started by autosaves so far: a save function that started none skipped its value. */
let sent = 0

/** true while an autosave field hands its value to `save`: mutations started right now are autosaves. */
export function isAutosaving(): boolean {
  return saving > 0
}

/** A mutation started inside an autosave (query.ts, MutationCache.onMutate). */
export function noteAutosaveSent(): void {
  sent++
}

/** Some field holds a typed value that hasn't reached main yet (its timer is running, or an error holds it). */
export function hasPendingAutosaves(): boolean {
  return waiting.size > 0
}

/**
 * Saves all pending edits right now. Called before creating a record: otherwise the editor that
 * closes after the create would save later and jump above the new record in "recently changed" lists.
 * While a field of the record being edited shows an error nothing goes out (editSignal.held).
 */
export function flushAllAutosaves(): void {
  for (const f of flushers) f()
}

/**
 * Every field shows its server value again. Called after «Скасувати» reverted a record: the revert can bring
 * the same value the query already held (typed text saved and reverted before any refetch), and a draft that
 * only follows *changes* of `value` would keep showing the cancelled text. A field with edits still pending
 * (typed while the revert ran) saves them instead — unless an error holds them: those are dropped with the rest.
 */
export function resetAllAutosaves(): void {
  for (const r of resetters) r(true)
}

/**
 * Leaving edit mode without a revert («Зберегти», Esc with nothing changed): a value that never reached main — the
 * save function skipped it (an emptied title) or an error held it — goes back to the stored one. Values that were
 * saved stay as typed: resetting them to the last fetched value would flash the old text until the refetch.
 */
export function dropUnsentAutosaves(): void {
  for (const r of resetters) r(false)
}

/**
 * Local editable copy of a server value that saves itself after the user stops typing.
 * - `value` is the server state; when it changes (other window/refetch) and there are no
 *   pending local edits, the draft follows it.
 * - Pending edits are flushed on unmount so nothing is lost when switching items — except a value held back
 *   because a field of the record shows an error: invalid data never reaches main.
 * - `save` must call mutate synchronously: only such mutations count as autosaves (their failure stops
 *   «Зберегти»), and a call that starts none counts as skipped (the draft isn't stored).
 * - Every keystroke and every flush tells the record being edited (editSignal), so «Зберегти» knows whether
 *   there is anything to save.
 */
export function useAutosave<T>(
  value: T,
  save: (next: T) => void,
  delay = 600
): [T, (next: T) => void] {
  const [draft, setDraft] = useState(value)
  const pending = useRef<T | null>(null)
  /** The draft never reached main: the save function skipped it. */
  const unsent = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  const [self] = useState(() => ({}))
  useEffect(() => {
    saveRef.current = save
  })

  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
    unsent.current = false
    if (pending.current === null) setDraft(value)
  }, [value])

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const flush = useCallback(() => {
    clear()
    if (pending.current === null) return
    // A field of the record shows an error: keep the value until it's fixed (or dropped by «Не зберігати»).
    if (editSignal.held()) return
    const next = pending.current
    pending.current = null
    waiting.delete(self)
    const before = sent
    saving++
    try {
      saveRef.current(next)
    } finally {
      saving--
    }
    unsent.current = sent === before
    editSignal.saved()
  }, [clear, self])

  useEffect(() => {
    flushers.add(flush)
    return () => {
      flushers.delete(flush)
      flush()
      waiting.delete(self)
    }
  }, [flush, self])

  useEffect(() => {
    const reset = (revert: boolean): void => {
      if (pending.current !== null && !editSignal.held()) {
        // The record's own fields were flushed before the revert; a field still pending was typed into while the
        // revert ran (timer note, another section) — save it instead of throwing it away.
        if (revert) flush()
        return
      }
      if (pending.current === null && !revert && !unsent.current) return
      clear()
      pending.current = null
      waiting.delete(self)
      unsent.current = false
      setDraft(latest.current)
    }
    resetters.add(reset)
    return () => {
      resetters.delete(reset)
    }
  }, [clear, flush, self])

  const update = useCallback(
    (next: T) => {
      setDraft(next)
      pending.current = next
      waiting.add(self)
      clear()
      timer.current = setTimeout(flush, delay)
      editSignal.edited()
    },
    [clear, delay, flush, self]
  )

  return [draft, update]
}
