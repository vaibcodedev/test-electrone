import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { GO_TO, isAiChatToggle, isSidebarToggle } from '@/app/shortcuts'
import { useNavVisibility } from '@/hooks/use-nav-visibility'
import { useUi } from '@/stores/ui-store'
import {
  MENU_OPEN,
  isEditableTarget as isEditable,
  isTypeaheadTarget,
  overlayOpen
} from '@/lib/dom'

function visible(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.offsetParent !== null
}

/**
 * Global keyboard layer (one listener for the whole window):
 * Alt+1…9, Ctrl+, Ctrl+/ ?, [ ], G-sequences, and page-level N / "/" / Esc that work through
 * data attributes on shared components — modules get them for free:
 *   - N  → the visible [data-page-new] (a field gets focus, a button is clicked), else the first enabled lime
 *          button in [data-slot=page-header], including a form among the header's children («Додати» on
 *          «Англійська»).
 *   - /  → page search field ([data-page-search])
 *   - Esc → close the open detail pane ([data-close-detail])
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate()
  const setHelpOpen = useUi((s) => s.setShortcutsOpen)
  const pendingG = useRef<number>(0)
  const { order } = useNavVisibility()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      const mod = e.ctrlKey || e.metaKey

      // Alt+1…9 → nth section
      if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) {
        // In the order of the menu the user sees: hidden sections are skipped.
        const item = order[Number(e.code.slice(5)) - 1]
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
      // Works in fields too, like Ctrl+K: it only changes the width, nothing typed is touched.
      if (isSidebarToggle(e)) {
        e.preventDefault()
        useUi.getState().toggleSidebar()
        return
      }
      // The chat on the right, from anywhere (a field too): Ctrl+J again closes it.
      if (isAiChatToggle(e)) {
        e.preventDefault()
        useUi.getState().toggleAiChat()
        return
      }

      // Esc while typing in a record being edited: leave the field and ask «Зберегти зміни?» — the hint
      // on «Зберегти» promises Esc. Skipped when the field handled it itself (CodeMirror, a combobox).
      if (
        e.key === 'Escape' &&
        !mod &&
        isEditable(e.target) &&
        !overlayOpen() &&
        (e.target as HTMLElement).closest('[data-detail-mode="edit"]')
      ) {
        const close = document.querySelector('[data-close-detail]')
        if (visible(close)) {
          e.preventDefault()
          ;(e.target as HTMLElement).blur()
          close.click()
        }
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
      // A closed Select takes letters as typeahead: N or E there would change the value and act at once.
      if (isTypeaheadTarget(e.target)) return
      // E works inside record sheets (vacancy, board card, proposal) — they are dialogs too, so this runs
      // before the overlay check and looks in the topmost open dialog, or the page when none is open.
      // G then E is still «go to Англійська» (handled below).
      const afterG = pendingG.current && Date.now() - pendingG.current < 1000
      if (e.code === 'KeyE' && !e.shiftKey && !afterG) {
        if (document.querySelector(MENU_OPEN)) return
        const layers = document.querySelectorAll('[role="dialog"][data-state="open"]')
        const scope = layers.length ? layers[layers.length - 1] : document
        const editBtn = scope.querySelector('[data-edit-detail]')
        if (visible(editBtn)) {
          e.preventDefault()
          editBtn.click()
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
        const target = [...document.querySelectorAll('[data-page-new]')].find(visible)
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          e.preventDefault()
          target.focus()
          return
        }
        const primary = (target ??
          [...document.querySelectorAll('[data-slot="page-header"] [data-variant="lime"]')].find(
            (b) => visible(b) && !(b as HTMLButtonElement).disabled
          )) as HTMLElement | undefined
        if (primary) {
          e.preventDefault()
          primary.click()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, setHelpOpen, order])
}
