import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * One URL search param as state (`?open=`, `?card=`, `?situation=`): links and search can deep-link to it.
 * The setter keeps the other params, null removes this one, and the history entry is replaced (Back leaves
 * the page instead of stepping through every opened record).
 */
export function useSearchParam(name: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(name)
  const setValue = useCallback(
    (next: string | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next) p.set(name, next)
          else p.delete(name)
          return p
        },
        { replace: true }
      ),
    [name, setParams]
  )
  return [value, setValue]
}
