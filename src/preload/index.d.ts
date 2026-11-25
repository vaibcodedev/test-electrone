declare global {
  interface Window {
    vault: import('../shared/bridge').VaultBridge
  }
}

export {}
