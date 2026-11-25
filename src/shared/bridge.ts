import type { MainEventName, RpcResult } from './api'
import type { ProfileKind } from './domain/sandbox'

/** What preload exposes as `window.vault` (the only surface the renderer gets). */
export interface VaultBridge {
  rpc(path: string, arg?: unknown): Promise<RpcResult>
  on(event: MainEventName, listener: (payload: unknown) => void): () => void
  /** Absolute path of a dropped File (File.path was removed from Electron). */
  pathForFile(file: File): string
  platform: string
  /** Data profile of this process: 'sandbox' in «Тестовий режим» (set by main per window). */
  profile: ProfileKind
}
