import { safeStorage } from 'electron'
import { UserError } from '../core/util'

/**
 * Encrypts credentials with the OS keychain (DPAPI on Windows) via Electron safeStorage.
 * Note: DPAPI-encrypted secrets can only be decrypted by the same Windows user on the same machine.
 */
export class SecretBox {
  encrypt(plain: string): string {
    if (!plain) return ''
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plain).toString('base64')
    }
    return 'plain:' + Buffer.from(plain, 'utf8').toString('base64')
  }

  decrypt(stored: string): string {
    if (!stored) return ''
    if (stored.startsWith('enc:')) {
      try {
        return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
      } catch {
        throw new UserError('Не вдалося розшифрувати: секрет зашифровано на іншому комп’ютері чи користувачі')
      }
    }
    if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    return stored
  }
}
