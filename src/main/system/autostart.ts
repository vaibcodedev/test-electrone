import { app } from 'electron'

export const HIDDEN_ARG = '--hidden'

/** Start with Windows. In dev the exe is electron.exe, so it is applied only in packaged builds. */
export function applyAutostart(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] })
}

export function launchedHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG)
}
