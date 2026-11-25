import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** The fade at the bottom of folded text: says «there is more» without a hard cut. */
const FADE = 'mask-[linear-gradient(to_bottom,black_70%,transparent)]'
/** --ease-soft and the 220ms of the record pane: unfolding reads as the same motion as the rest of the app. */
const UNFOLD = { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }

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
  const from = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    const start = from.current
    from.current = null
    if (!el || start === null || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const end = el.getBoundingClientRect().height
    if (Math.abs(end - start) < 1) return
    el.animate(
      [
        { height: `${start}px`, maxHeight: 'none', overflow: 'hidden' },
        { height: `${end}px`, maxHeight: 'none', overflow: 'hidden' }
      ],
      UNFOLD
    )
  }, [open])
  useLayoutEffect(() => {
    if (enabled !== 'auto' || open) return
    const el = box.current
    if (!el) return
    const check = (): void => setOverflows(el.scrollHeight > el.clientHeight + 4)
    check()
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
            from.current = box.current?.getBoundingClientRect().height ?? null
            setOpen(!open)
          }}
        >
          {open ? 'Згорнути' : moreLabel}
        </Button>
      )}
    </div>
  )
}
