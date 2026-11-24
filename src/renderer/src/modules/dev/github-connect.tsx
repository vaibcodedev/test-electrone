import { useState } from 'react'
import { ExternalLink, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Field } from '@/components/common/page'
import { cn } from '@/lib/utils'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

export const TOKEN_STEPS = [
  'Откройте страницу создания токена (кнопка ниже) и войдите в GitHub.',
  'Token name — например «Vault», Expiration — до года.',
  'Repository access → All repositories (или только нужные).',
  'Permissions → Repositories: Metadata, Contents, Issues, Pull requests — везде «Read-only».',
  'Нажмите «Generate token», скопируйте его и вставьте сюда.'
]

/** Token field — saves it encrypted with the OS keychain. */
export function GithubTokenField({ compact }: { compact?: boolean }) {
  const [token, setToken] = useState('')
  const save = useApiMutation('github', 'setToken', {
    onSuccess: (s) => {
      if (s.connected) toast.success(`GitHub подключён: ${s.login}`)
      else toast.error(s.error ?? 'Токен не подошёл')
      setToken('')
    }
  })
  const submit = (): void => {
    if (token.trim()) save.mutate({ token: token.trim() })
  }
  return (
    <Field
      label="Токен GitHub"
      htmlFor="github-token"
      hint="Хранится зашифрованным ключом Windows и используется только для чтения."
    >
      <div className="flex items-center gap-2">
        {/* bg-card: the field sits on a surface card, so it needs its own fill to read as an input. */}
        <InputGroup className={cn('flex-1 bg-card', compact && 'h-9')}>
          <InputGroupAddon>
            <KeyRound />
          </InputGroupAddon>
          <InputGroupInput
            id="github-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Вставьте токен github_pat_…"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </InputGroup>
        <Button variant="lime" disabled={!token.trim() || save.isPending} onClick={submit}>
          Подключить
        </Button>
      </div>
    </Field>
  )
}

/** Step-by-step guide to create a read-only fine-grained token. */
export function GithubGuide() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body">
        {TOKEN_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Button variant="subtle" className="self-start" onClick={() => api.app.openExternal(NEW_TOKEN_URL)}>
        <ExternalLink /> Создать токен на GitHub
      </Button>
      <GithubTokenField />
    </div>
  )
}
