import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLocation } from 'react-router'
import { scrollBehavior } from '@/lib/dom'

/**
 * Table-of-contents state for a long scrolling page: the section in view is `active` (IntersectionObserver
 * on the scroller), `jump` scrolls to a section, and the URL hash deep-links — /guide#data jumps to a
 * section, /guide#faq-links opens that answer (`openFaq`) and scrolls to it.
 */
export function useScrollSpy({
  sectionIds,
  faqIds,
  openFaq
}: {
  sectionIds: string[]
  faqIds: ReadonlySet<string>
  openFaq: (id: string) => void
}): { scroller: RefObject<HTMLDivElement | null>; active: string; jump: (id: string) => void } {
  const scroller = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()
  const [active, setActive] = useState(sectionIds[0])

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { root, rootMargin: '0px 0px -65% 0px', threshold: 0 }
    )
    for (const id of sectionIds) {
      const el = root.querySelector(`#${id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sectionIds])

  useEffect(() => {
    const target = decodeURIComponent(hash.replace(/^#/, ''))
    if (!target) return
    if (target.startsWith('faq-')) {
      const id = target.slice(4)
      if (!faqIds.has(id)) return
      openFaq(id)
      // After the collapsible opens, bring the answer into view.
      requestAnimationFrame(() => scroller.current?.querySelector(`#${CSS.escape(target)}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }))
    } else if (sectionIds.includes(target)) {
      scroller.current?.querySelector(`#${CSS.escape(target)}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    }
    // `active` follows by itself: the observer above sees the section scroll into view.
  }, [hash, faqIds, openFaq, sectionIds])

  const jump = (id: string): void => {
    scroller.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    setActive(id)
  }

  return { scroller, active, jump }
}
