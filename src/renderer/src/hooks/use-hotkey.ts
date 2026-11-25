import { useEffect, useRef } from 'react'
import { isEditableTarget, overlayOpen } from '@/lib/dom'

export interface HotkeyOptions {
  /** Fire even when focus is inside an input/textarea/editor. */
  allowInInputs?: boolean
  /**
   * Fire a key without Ctrl/Alt even while a dialog, menu or Select list is open. Off by default: N, arrows or
   * T of the page behind it must not act (mod combos — mod+k closes the palette — always fire).
   */
  allowInOverlay?: boolean
  enabled?: boolean
}

/**
 * Minimal hotkey hook. Combo syntax: "mod+k", "alt+1", "shift+?", "escape".
 * `mod` = Ctrl on Windows/Linux, Cmd on macOS.
 */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, options: HotkeyOptions = {}): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (options.enabled === false) return
    const parts = combo.toLowerCase().split('+')
    const key = parts.pop()!
    const wantMod = parts.includes('mod')
    const wantAlt = parts.includes('alt')
    const wantShift = parts.includes('shift')
    const isMac = window.vault.platform === 'darwin'
    const onKey = (e: KeyboardEvent): void => {
      // Already handled (a dialog closed on Esc, the global layer clicked «close»): don't act twice.
      if (e.defaultPrevented) return
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod !== wantMod || e.altKey !== wantAlt || e.shiftKey !== wantShift) return
      const pressed = e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase()
      if (pressed !== key) return
      if (!options.allowInInputs && isEditableTarget(e.target)) return
      if (!options.allowInOverlay && !wantMod && !wantAlt && overlayOpen()) return
      e.preventDefault()
      ref.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [combo, options.allowInInputs, options.allowInOverlay, options.enabled])
}
