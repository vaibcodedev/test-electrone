import { useEffect } from 'react'
import { INVALID_FIELD } from '@/lib/edit-session'

/**
 * While a field inside `root` shows an error, keeps `hold()` taken; releases it once none does. A field shows an
 * error the shadcn way — `aria-invalid` on the control, `data-invalid` on its Field (Field `error`, NumberField out
 * of range, LinkInput, a required InlineTitle, an over-limit Markdown text) — so every field that is highlighted
 * counts, whatever module drew it, and none has to report itself. `hold` undefined — not watching.
 */
export function useHoldWhileInvalid(
  root: Element | null,
  hold: (() => () => void) | undefined
): void {
  useEffect(() => {
    if (!root || !hold) return
    let release: (() => void) | null = null
    const check = (): void => {
      const bad = !!root.querySelector(INVALID_FIELD)
      if (bad && !release) release = hold()
      else if (!bad && release) {
        release()
        release = null
      }
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-invalid', 'data-invalid']
    })
    return () => {
      observer.disconnect()
      release?.()
    }
  }, [root, hold])
}
