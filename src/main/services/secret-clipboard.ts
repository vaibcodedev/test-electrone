import { log } from '../core/logger'

/** The part of Electron's clipboard it needs (Electron 44: the W3C-style async text API + sync clear). */
export interface ClipboardLike {
  writeText(text: string): Promise<void>
  readText(): Promise<string>
  clear(): void
}

/**
 * Copies a secret (password, key, the DB string with the password) and clears the clipboard after `seconds` —
 * only if it still holds that very value: whatever the person copied since stays. The value never leaves main.
 */
export class SecretClipboard {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly clipboard: ClipboardLike) {}

  async copy(text: string, seconds: number): Promise<void> {
    await this.clipboard.writeText(text)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.clearIfStill(text)
    }, seconds * 1000)
    // A pending clear must not keep the process (tests, quitting) alive.
    this.timer.unref?.()
  }

  private async clearIfStill(text: string): Promise<void> {
    try {
      if ((await this.clipboard.readText()) === text) this.clipboard.clear()
    } catch (e) {
      // The message only: the value itself never goes to the log.
      log.warn(`[clipboard] could not clear a copied secret: ${(e as Error).message}`)
    }
  }
}
