import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EASE_SOFT, reducedMotion } from '@/lib/motion'
import { Button } from '@/components/ui/button'

/** The fade at the bottom of folded text: says «there is more» without a hard cut. */
const FADE = 'mask-[linear-gradient(to_bottom,black_70%,transparent)]'
/** --ease-soft and the 220ms of the record pane: unfolding reads as the same motion as the rest of the app. */
const UNFOLD = { duration: 220, easing: EASE_SOFT }

/** The nearest ancestor that scrolls vertically (the record pane's body, a sheet). */
function scrollParent(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/**
 * Long text in a record being read, folded to `collapsedClass` with «Показати повністю» / «Згорнути» under it
 * (a link button, no inner scroll). `enabled`:
 * - `true` — folded (the caller decided the text is long; `collapsedClass` carries its own fade if wanted);
 * - `'auto'` — folded only when the text really is taller than `collapsedClass` allows: measured, so a short text
 *   gets neither the button nor the fade;
 * - `false` — the text shows as is.
 */
export function ShowMore({
  enabled,
  collapsedClass,
  moreLabel = 'Показати повністю',
  children
}: {
  enabled: boolean | 'auto'
  collapsedClass: string
  moreLabel?: string
  children: ReactNode
}): ReactElement {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(enabled === true)
  // Height before «Показати повністю» / «Згорнути»: the box then grows or shrinks to its new height instead of
  // jumping (the folded class is a line-clamp or a max-height, neither of which CSS can transition to «none»).
  const from = useRef<{ height: number; scroller: Element | null; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    const start = from.current
    from.current = null
    if (!el || start === null || reducedMotion()) return
    // Measuring lays the folded box out once: the pane's scroll was clamped to the shorter text, and «Згорнути» at
    // the end of a long note threw the reader ~1 000px up before the fold even started. Given back below.
    const end = el.getBoundingClientRect().height
    if (Math.abs(end - start.height) < 1) return
    el.animate(
      [
        { height: `${start.height}px`, maxHeight: 'none', overflow: 'hidden' },
        { height: `${end}px`, maxHeight: 'none', overflow: 'hidden' }
      ],
      UNFOLD
    )
    if (start.scroller) start.scroller.scrollTop = start.top
  }, [open])
  useLayoutEffect(() => {
    if (enabled !== 'auto' || open) return
    const el = box.current
    if (!el) return
    // Not while «Згорнути» is animating: the box still has its full height, and the button blinked out for a frame.
    const check = (): void => {
      if (el.getAnimations().length === 0) setOverflows(el.scrollHeight > el.clientHeight + 4)
    }
    check()
    // A cancelled animation (the box unmounted) has nothing left to measure.
    void Promise.all(el.getAnimations().map((a) => a.finished)).then(check, () => undefined)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [enabled, open])
  if (!enabled) return <>{children}</>
  const auto = enabled === 'auto'
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div
        ref={box}
        className={cn(
          'w-full min-w-0',
          !open && collapsedClass,
          !open && auto && overflows && FADE
        )}
      >
        {children}
      </div>
      {(overflows || open) && (
        <Button
          variant="link"
          size="xs"
          aria-expanded={open}
          onClick={() => {
            const el = box.current
            const scroller = el ? scrollParent(el) : null
            from.current = el
              ? { height: el.getBoundingClientRect().height, scroller, top: scroller?.scrollTop ?? 0 }
              : null
            setOpen(!open)
          }}
        >
          {open ? 'Згорнути' : moreLabel}
        </Button>
      )}
    </div>
  )
}
