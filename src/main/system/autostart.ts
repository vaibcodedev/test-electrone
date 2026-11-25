import { app } from 'electron'
import type { ProfileKind } from '@shared/domain/sandbox'

export const HIDDEN_ARG = '--hidden'

/**
 * Start with Windows. In dev the exe is electron.exe, so it is applied only in packaged builds.
 * Never from «Тестовий режим»: the login item is one per OS and belongs to the real Vault.
 */
export function applyAutostart(enabled: boolean, profile: ProfileKind = 'main'): void {
  if (!app.isPackaged || profile === 'sandbox') return
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] })
}

export function launchedHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG)
}
