import { app, type BrowserWindow } from 'electron'

/**
 * Windows of automated runs (tests, screenshot scripts: they set VAULT_NO_NOTIFY) stay out of the person's way:
 * off every screen, not in the taskbar, never taking the focus. Playwright drives and screenshots them as usual.
 * `VAULT_SHOW_WINDOWS=1` shows them, to watch a run. Never in an installed Vault.
 */
export const hiddenWindows = (): boolean =>
  !app.isPackaged &&
  process.env['VAULT_NO_NOTIFY'] === '1' &&
  process.env['VAULT_SHOW_WINDOWS'] !== '1'

/** Left of any real monitor layout (and not -32000, where Windows parks minimised windows). */
const AWAY = -20_000

/** Chromium would treat an off-screen window as covered and slow its timers and animation frames down. */
export function keepOffscreenWindowsActive(): void {
  if (hiddenWindows()) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

export function keepOutOfSight(win: BrowserWindow): void {
  if (!hiddenWindows()) return
  const away = (): void => win.setPosition(AWAY, AWAY)
  const showInactive = win.showInactive.bind(win)
  win.show = (): void => {
    away()
    showInactive()
    away()
  }
  win.showInactive = win.show
  win.focus = (): void => {}
  // A maximised window would jump back onto a screen.
  win.maximize = (): void => {}
  win.setSkipTaskbar(true)
  away()
}
