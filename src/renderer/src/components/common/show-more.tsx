import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** The fade at the bottom of folded text: says «there is more» without a hard cut. */
const FADE = 'mask-[linear-gradient(to_bottom,black_70%,transparent)]'

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
        <Button variant="link" size="xs" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Згорнути' : moreLabel}
        </Button>
      )}
    </div>
  )
}
