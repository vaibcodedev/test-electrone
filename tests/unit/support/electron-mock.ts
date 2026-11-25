/** Stand-ins for the Electron APIs main services touch at import/construction time (see support/vault.ts). */
export const electronMock = {
  app: { getVersion: () => 'test', getPath: () => '', isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openPath: async () => '', showItemInFolder: () => undefined },
  clipboard: {},
  nativeImage: {},
  safeStorage: { isEncryptionAvailable: () => false }
}

export const loggerMock = { log: { info: () => undefined, warn: () => undefined, error: () => undefined } }
