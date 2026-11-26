import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

/**
 * `?new=1` from another screen («+ Відгук» / «Поставити ціль» on the overview): calls `onNew` once
 * while rendering (no setState in an effect) and then drops the flag from the URL, so going back
 * or reloading doesn't open the form again.
 */
export function useNewParam(onNew: () => void): void {
  const [params, setParams] = useSearchParams()
  const wantsNew = params.get('new') === '1'
  const [seen, setSeen] = useState(false)
  if (wantsNew !== seen) {
    setSeen(wantsNew)
    if (wantsNew) onNew()
  }
  useEffect(() => {
    if (!wantsNew) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true }
    )
  }, [wantsNew, setParams])
}
