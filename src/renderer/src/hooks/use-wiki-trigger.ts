import { useCallback, useRef, useState } from 'react'
import { findWikiTrigger } from '@shared/wikilinks'
import { caretCoordinates } from '@/lib/caret'

/** The `[[запит` being typed: where it starts in the text and what follows it. */
export interface WikiTrigger {
  start: number
  query: string
}

/** Where the menu anchors, in px inside the textarea: the line of the «[[». */
export interface WikiAnchor {
  top: number
  left: number
  height: number
}

/**
 * Tracks the «[[» typed in a textarea. `update` after every edit or caret move; `dismiss` (Esc) keeps the menu
 * closed for that `[[` until it is gone — typing a literal `[[` must stay possible. The anchor outlives the
 * trigger, so the menu fades out where it was instead of jumping to the corner.
 */
export function useWikiTrigger(): {
  trigger: WikiTrigger | null
  anchor: WikiAnchor
  update: (el: HTMLTextAreaElement) => void
  close: () => void
  dismiss: () => void
} {
  const [trigger, setTrigger] = useState<WikiTrigger | null>(null)
  const [anchor, setAnchor] = useState<WikiAnchor>({ top: 0, left: 0, height: 0 })
  const dismissed = useRef<number | null>(null)

  const update = useCallback((el: HTMLTextAreaElement) => {
    const found =
      el.selectionStart === el.selectionEnd ? findWikiTrigger(el.value, el.selectionStart) : null
    if (!found) dismissed.current = null
    if (!found || dismissed.current === found.start) {
      setTrigger(null)
      return
    }
    // Anchored at the «[[» itself, not the caret: the menu stays put while the query is typed.
    const at = caretCoordinates(el, found.start)
    setAnchor((prev) =>
      prev.top === at.top && prev.left === at.left && prev.height === at.height ? prev : at
    )
    setTrigger((prev) =>
      prev && prev.start === found.start && prev.query === found.query ? prev : found
    )
  }, [])

  const close = useCallback(() => setTrigger(null), [])

  const dismiss = useCallback(() => {
    if (trigger) dismissed.current = trigger.start
    setTrigger(null)
  }, [trigger])

  return { trigger, anchor, update, close, dismiss }
}
