import { useState } from 'react'
import { ExternalLink, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'

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
  return (
    <div className="flex flex-col gap-2">
      <InputGroup className={compact ? 'bg-card' : undefined}>
        <InputGroupAddon>
          <KeyRound />
        </InputGroupAddon>
        <InputGroupInput
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_…"
          onKeyDown={(e) => e.key === 'Enter' && token.trim() && save.mutate({ token: token.trim() })}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="xs" variant="default" disabled={!token.trim() || save.isPending} onClick={() => save.mutate({ token: token.trim() })}>
            Подключить
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-[12px] text-muted-foreground">Токен хранится зашифрованным ключом Windows и используется только для чтения.</p>
    </div>
  )
}

/** Step-by-step guide to create a read-only fine-grained token. */
export function GithubGuide() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
        {TOKEN_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Button variant="soft" className="self-start" onClick={() => api.app.openExternal(NEW_TOKEN_URL)}>
        <ExternalLink /> Создать токен на GitHub
      </Button>
      <GithubTokenField />
    </div>
  )
}
