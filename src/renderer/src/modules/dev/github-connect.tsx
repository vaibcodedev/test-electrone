import { useRef, useState, type ReactElement } from 'react'
import { openUrl } from '@/lib/open-url'
import { ExternalLink, KeyRound, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { useApi, useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Field } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { cn } from '@/lib/utils'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'
const ALL = '__all'

const TOKEN_STEPS = [
  'Відкрийте сторінку створення токена (кнопка нижче) й увійдіть у GitHub.',
  'Token name — наприклад «Vault», Expiration — до року.',
  'Repository access → All repositories (або лише потрібні).',
  'Permissions → Repositories: Metadata, Contents, Issues, Pull requests — скрізь «Read-only».',
  'Натисніть «Generate token», скопіюйте його й вставте сюди.'
]

/**
 * Token field — saves it encrypted with the OS keychain. `submitVariant="subtle"` in Settings: «Підключити» is
 * the main action of /dev/github, but not of the settings screen, which has no single main action.
 */
export function GithubTokenField({
  compact,
  submitVariant = 'lime'
}: {
  compact?: boolean
  submitVariant?: 'lime' | 'subtle'
}): ReactElement {
  const [token, setToken] = useState('')
  const [missing, setMissing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('github', 'setToken', {
    onSuccess: (s) => {
      if (s.connected) toast.success(`GitHub підключено: ${s.login}`)
      else toast.error(s.error ?? 'Токен не підійшов')
      setToken('')
    }
  })
  const submit = (): void => {
    // A second Enter while the first check is running would save twice and toast twice.
    if (save.isPending) return
    // Not a disabled button: an empty field says why at the field instead.
    if (!token.trim()) {
      setMissing(true)
      inputRef.current?.focus()
      return
    }
    save.mutate({ token: token.trim() })
  }
  return (
    <Field
      label="Токен GitHub"
      htmlFor="github-token"
      hint="Зберігається зашифрованим ключем Windows і використовується лише для читання."
      error={missing ? 'Вставте токен із GitHub' : undefined}
    >
      <div className="flex items-center gap-2">
        {/* bg-card: the field sits on a surface card, so it needs its own fill to read as an input. */}
        <InputGroup className={cn('flex-1 bg-card', compact && 'h-9')}>
          <InputGroupAddon>
            <KeyRound />
          </InputGroupAddon>
          <InputGroupInput
            id="github-token"
            ref={inputRef}
            type="password"
            autoComplete="off"
            value={token}
            aria-invalid={missing || undefined}
            // Field gives the message under the control these ids (`${htmlFor}-error` / `-hint`).
            aria-describedby={missing ? 'github-token-error' : 'github-token-hint'}
            onChange={(e) => {
              setToken(e.target.value)
              setMissing(false)
            }}
            placeholder="Вставте токен github_pat_…"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </InputGroup>
        <Button variant={submitVariant} disabled={save.isPending} onClick={submit}>
          Підключити
        </Button>
      </div>
    </Field>
  )
}

/** Step-by-step guide to create a read-only fine-grained token. */
export function GithubGuide(): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body">
        {TOKEN_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Button variant="subtle" className="self-start" onClick={() => openUrl(NEW_TOKEN_URL)}>
        <ExternalLink /> Створити токен на GitHub
      </Button>
      <GithubTokenField />
    </div>
  )
}

/** «Відключити» with its confirmation (GitHub page header, Settings → GitHub). */
export function GithubDisconnectButton({ size }: { size?: 'sm' }): ReactElement {
  const disconnect = useApiMutation('github', 'setToken', { successMessage: 'GitHub відключено' })
  return (
    <Confirm
      title="Відключити GitHub?"
      description="Токен буде видалено з Vault. На GitHub його можна відкликати окремо."
      confirmLabel="Відключити"
      onConfirm={() => disconnect.mutate({ token: '' })}
    >
      <Button variant="ghost" size={size}>
        <Unplug /> Відключити
      </Button>
    </Confirm>
  )
}

/** Repository filter of a GitHub tab: `undefined` = the tab's own «all» meaning (`allLabel`). */
export function RepoSelect({
  value,
  onChange,
  allLabel
}: {
  value: string | undefined
  onChange: (repo: string | undefined) => void
  allLabel: string
}): ReactElement {
  const { data: repos = [] } = useApi('github', 'repos', { force: false })
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger size="sm" className="w-64" aria-label="Репозиторій">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {repos.map((r) => (
          <SelectItem key={r.fullName} value={r.fullName}>
            {r.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
