import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * For a close that runs later — after a delay (the trash's fade-out) or a request (`onSuccess`): the returned check
 * is true only while this component is still mounted and `key` is what it rendered when the check was taken.
 * Without it «У кошик» on record A, then a click on record B, closed B: the late close knew nothing of the switch.
 * Key the record (and, for a pane MasterDetail may hold on screen while the next record loads, the `?open=` value).
 */
export function useStillCurrent(key: string): () => boolean {
  const current = useRef<string | null>(key)
  useLayoutEffect(() => {
    current.current = key
    return () => {
      current.current = null
    }
  }, [key])
  return useCallback(() => current.current === key, [key])
}
