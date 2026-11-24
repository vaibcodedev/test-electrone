import type { MainEventName, RpcResult } from '../shared/api'

declare global {
  interface Window {
    vault: {
      rpc(path: string, arg?: unknown): Promise<RpcResult>
      on(event: MainEventName, listener: (payload: unknown) => void): () => void
      pathForFile(file: File): string
      platform: string
    }
  }
}

export {}
