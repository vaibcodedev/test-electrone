import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { MAIN_EVENTS, RPC_CHANNEL, type MainEventName, type RpcResult } from '@shared/api'
import type { VaultBridge } from '@shared/bridge'
import { PROFILE_ARG_PREFIX } from '@shared/domain/sandbox'

/**
 * The ONLY surface the renderer gets. No raw ipcRenderer, no Node.
 * - rpc: one invoke channel, path validated here and again (with zod) in main.
 * - on: whitelisted main → renderer events.
 */
const RPC_PATH = /^[a-z][a-zA-Z]*\.[a-zA-Z]+$/

const bridge: VaultBridge = {
  rpc(path: string, arg?: unknown): Promise<RpcResult> {
    if (!RPC_PATH.test(path)) return Promise.resolve({ ok: false, error: `Bad rpc path: ${path}` })
    return ipcRenderer.invoke(RPC_CHANNEL, path, arg)
  },
  on(event: MainEventName, listener: (payload: unknown) => void): () => void {
    if (!MAIN_EVENTS.includes(event)) throw new Error(`Unknown event: ${event}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(event, wrapped)
    return () => ipcRenderer.removeListener(event, wrapped)
  },
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
  platform: process.platform,
  // webPreferences.additionalArguments land in process.argv of the (sandboxed) preload.
  profile: process.argv.includes(`${PROFILE_ARG_PREFIX}sandbox`) ? 'sandbox' : 'main'
}

contextBridge.exposeInMainWorld('vault', bridge)
