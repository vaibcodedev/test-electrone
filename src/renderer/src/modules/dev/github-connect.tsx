import { useState } from 'react'
import { openUrl } from '@/lib/open-url'
import { ExternalLink, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Field } from '@/components/common/page'
import { cn } from '@/lib/utils'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

export const TOKEN_STEPS = [
  'Відкрийте сторінку створення токена (кнопка нижче) й увійдіть у GitHub.',
  'Token name — наприклад «Vault», Expiration — до року.',
  'Repository access → All repositories (або лише потрібні).',
  'Permissions → Repositories: Metadata, Contents, Issues, Pull requests — скрізь «Read-only».',
  'Натисніть «Generate token», скопіюйте його й вставте сюди.'
]

/** Token field — saves it encrypted with the OS keychain. */
export function GithubTokenField({ compact }: { compact?: boolean }) {
  const [token, setToken] = useState('')
  const save = useApiMutation('github', 'setToken', {
    onSuccess: (s) => {
      if (s.connected) toast.success(`GitHub підключено: ${s.login}`)
      else toast.error(s.error ?? 'Токен не підійшов')
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
      hint="Зберігається зашифрованим ключем Windows і використовується лише для читання."
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
            placeholder="Вставте токен github_pat_…"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </InputGroup>
        <Button variant="lime" disabled={!token.trim() || save.isPending} onClick={submit}>
          Підключити
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
      <Button variant="subtle" className="self-start" onClick={() => openUrl(NEW_TOKEN_URL)}>
        <ExternalLink /> Створити токен на GitHub
      </Button>
      <GithubTokenField />
    </div>
  )
}
