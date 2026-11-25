import type { ProfileKind } from '@shared/domain/sandbox'

/** Data profile of this window (window.vault.profile, set by main through the preload). */
export const PROFILE: ProfileKind = window.vault?.profile === 'sandbox' ? 'sandbox' : 'main'
export const isSandbox = PROFILE === 'sandbox'

/**
 * «Тестовий режим» marks on <html> before the first render: `data-profile` switches the frame to sand
 * (globals.css) and the window title says so (the page's <title> wins over BrowserWindow.title).
 */
export function applyProfileMarker(): void {
  if (!isSandbox) return
  document.documentElement.dataset.profile = 'sandbox'
  document.title = 'Vault — тестовий режим'
}
