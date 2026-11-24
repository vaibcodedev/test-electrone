import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { ALL_NAV_ITEMS } from '@/app/navigation'
import { GO_TO } from '@/app/shortcuts'
import { useUi } from '@/stores/ui-store'

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('.cm-editor')
}

/** A modal (dialog/sheet/popover/menu) is open → page-level keys must not fire behind it. */
function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-slot="popover-content"][data-state="open"]')
}

function visible(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.offsetParent !== null
}

/**
 * Global keyboard layer (one listener for the whole window):
 * Alt+1…9, Ctrl+, Ctrl+/ ?, [ ], G-sequences, and page-level N / "/" / Esc that work through
 * data attributes on shared components — modules get them for free:
 *   - N  → first enabled lime button in the page header ([data-slot=page-header] [data-variant=lime])
 *   - /  → page search field ([data-page-search])
 *   - Esc → close the open detail pane ([data-close-detail])
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate()
  const setHelpOpen = useUi((s) => s.setShortcutsOpen)
  const pendingG = useRef<number>(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      const mod = e.ctrlKey || e.metaKey

      // Alt+1…9 → nth section
      if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) {
        const item = ALL_NAV_ITEMS[Number(e.code.slice(5)) - 1]
        if (item) {
          e.preventDefault()
          navigate(item.path)
        }
        return
      }
      if (mod && !e.altKey && e.code === 'Comma') {
        e.preventDefault()
        navigate('/settings')
        return
      }
      if (mod && !e.altKey && e.code === 'Slash') {
        e.preventDefault()
        setHelpOpen(true)
        return
      }

      if (mod || e.altKey || isEditable(e.target)) return

      if (e.key === 'Escape' && !overlayOpen()) {
        const close = document.querySelector('[data-close-detail]')
        if (visible(close)) {
          e.preventDefault()
          close.click()
        }
        return
      }
      if (overlayOpen()) return

      const key = e.key.toLowerCase()
      // G-then-letter navigation
      if (pendingG.current && Date.now() - pendingG.current < 1000) {
        pendingG.current = 0
        const target = GO_TO[key] ?? GO_TO[e.code.replace('Key', '').toLowerCase()]
        if (target) {
          e.preventDefault()
          navigate(target.route)
        }
        return
      }
      if (e.code === 'KeyG' && !e.shiftKey) {
        pendingG.current = Date.now()
        return
      }
      if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      if (e.code === 'BracketLeft') {
        e.preventDefault()
        navigate(-1)
        return
      }
      if (e.code === 'BracketRight') {
        e.preventDefault()
        navigate(1)
        return
      }
      if (e.code === 'Slash') {
        const search = document.querySelector('[data-page-search]')
        if (visible(search)) {
          e.preventDefault()
          search.focus()
        }
        return
      }
      if (e.code === 'KeyN' && !e.shiftKey) {
        const primary = [...document.querySelectorAll('[data-slot="page-header"] [data-variant="lime"]')].find(
          (b) => visible(b) && !(b as HTMLButtonElement).disabled
        ) as HTMLElement | undefined
        if (primary) {
          e.preventDefault()
          primary.click()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, setHelpOpen])
}
