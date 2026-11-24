import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** The card open in the side sheet lives in the URL (?card=<id>) so links and search can deep-link to it. */
export function useCardParam(): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams()
  const card = params.get('card')
  const setCard = useCallback(
    (id: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('card', id)
          else next.delete('card')
          return next
        },
        { replace: true }
      ),
    [setParams]
  )
  return [card, setCard]
}

/** Midnight-due cards are treated as "all day" (no time shown). */
export function hasTime(ts: number): boolean {
  const d = new Date(ts)
  return d.getHours() !== 0 || d.getMinutes() !== 0
}

export function isOverdue(dueAt: number | null, done: boolean): boolean {
  if (!dueAt || done) return false
  return hasTime(dueAt) ? dueAt < Date.now() : dueAt < new Date().setHours(0, 0, 0, 0)
}
