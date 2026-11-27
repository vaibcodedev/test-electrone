import { toast } from 'sonner'
import { api } from '@/lib/api'
import { reportError } from '@/lib/error-reporting'

/**
 * «Відкрити в терміналі»: only the id goes to main — it reads the server from the record, checks it and opens ssh in
 * a terminal window. The password is typed there; nothing secret passes through here.
 */
export async function openSshTerminal(id: string): Promise<void> {
  try {
    await api.credentials.openSsh(id)
    toast.success('Термінал відкрито', {
      description: 'Пароль від сервера введіть у вікні терміналу'
    })
  } catch (e) {
    toast.error((e as Error).message || 'Не вдалося відкрити термінал. Спробуйте ще раз.')
    reportError(e, 'credential:open-ssh')
  }
}
