import { toast } from 'sonner'
import {
  Copy,
  ExternalLink,
  KeyRound,
  Pencil,
  ShieldCheck,
  SquareTerminal,
  Terminal,
  Trash2
} from 'lucide-react'
import { sshCommand, type Credential } from '@shared/domain/credentials'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { reportError } from '@/lib/error-reporting'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import { copySecret } from './copy-secret'
import { openSshTerminal } from './open-ssh'

/** The 2FA code only when chosen: main computes it, the key never leaves main. */
async function copyTotp(id: string): Promise<void> {
  try {
    const { code } = await api.credentials.totp(id)
    await copyText(code, 'Код 2FA скопійовано')
  } catch (e) {
    toast.error('Код 2FA зараз недоступний')
    reportError(e, 'credential-menu:totp')
  }
}

/**
 * An access card's right click and «⋯»: the same copies as its cells. Secrets go through main exactly like the
 * cells' buttons (never through the renderer, cleared after 30 s) and nothing is asked for before an item is
 * chosen. «Змінити» and «Видалити» only while the record is being edited, as on the card.
 */
export const credentialMenu = defineRecordMenu<
  Credential,
  { editing: boolean; onEdit: () => void }
>({
  title: (c) => c.label,
  useGroups(c, { editing, onEdit }) {
    const remove = useApiMutation('credentials', 'remove', { successMessage: 'Доступ видалено' })
    const url = c.url.trim()
    return {
      open: [
        !!url && { label: 'Відкрити сайт', icon: ExternalLink, run: () => void openUrl(url) },
        !!c.login.trim() && {
          label: 'Копіювати логін',
          icon: Copy,
          run: () => void copyText(c.login.trim(), 'Логін скопійовано')
        },
        c.hasSecret && {
          label: c.kind === 'apiKey' ? 'Копіювати ключ' : 'Копіювати пароль',
          icon: KeyRound,
          run: () =>
            void copySecret({ id: c.id, field: 'secret' }, c.kind === 'apiKey' ? 'Ключ' : 'Пароль')
        },
        c.secretsSet.includes('totp') && {
          label: 'Копіювати код 2FA',
          icon: ShieldCheck,
          run: () => void copyTotp(c.id)
        },
        c.kind === 'server' &&
          !!c.fields.host && {
            label: 'Відкрити в терміналі',
            icon: SquareTerminal,
            run: () => void openSshTerminal(c.id)
          },
        c.kind === 'server' &&
          !!c.fields.host && {
            label: 'Копіювати команду SSH',
            icon: Terminal,
            run: () => void copyText(sshCommand(c), 'Команду SSH скопійовано')
          }
      ],
      state: [editing && { label: 'Змінити', icon: Pencil, run: onEdit }],
      danger: [
        editing && {
          label: 'Видалити доступ',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: `Видалити доступ «${c.label}»?`,
            description:
              'Паролі й ключі буде видалено без можливості відновлення. Підписка, якщо є, залишиться у Фінансах.',
            confirmLabel: 'Видалити'
          },
          run: () => remove.mutate(c.id)
        }
      ]
    }
  }
})
