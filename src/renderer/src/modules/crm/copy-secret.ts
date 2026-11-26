import { toast } from 'sonner'
import { CLIPBOARD_CLEAR_SECONDS, type CredentialCopy } from '@shared/domain/credentials'
import { api } from '@/lib/api'
import { reportError } from '@/lib/error-reporting'

/** Copies a secret in main: it never passes through the renderer, and the clipboard clears itself in 30 s. */
export async function copySecret(arg: CredentialCopy, what: string): Promise<void> {
  try {
    await api.credentials.copy(arg)
    toast.success(`${what} — скопійовано`, {
      description: `Буфер обміну очиститься через ${CLIPBOARD_CLEAR_SECONDS} с`
    })
  } catch (e) {
    toast.error((e as Error).message || 'Не вдалося скопіювати. Спробуйте ще раз.')
    reportError(e, 'copy secret')
  }
}
