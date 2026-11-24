import { useNavigate } from 'react-router'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useApiMutation } from '@/lib/query'
import { CopyButton } from '@/components/common/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Switch } from '@/components/ui/switch'
import { Confirm } from '@/components/common/confirm'
import { GithubTokenField } from './github-connect'

/** Settings → GitHub: connection status + token field. */
export function GithubSettingsCard() {
  const navigate = useNavigate()
  const { data: status } = useApi('github', 'status')
  const disconnect = useApiMutation('github', 'setToken', { successMessage: 'GitHub отключён' })
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-lead text-foreground">GitHub</CardTitle>
        <CardDescription className="text-caption">Репозитории, issues и коммиты в разделе «Разработка → GitHub». Токен только на чтение.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status?.connected ? (
          <Item size="sm" className="bg-card">
            <ItemContent>
              <ItemTitle className="font-normal">Подключён как @{status.login}</ItemTitle>
              {status.rateRemaining !== null && <ItemDescription className="text-caption">Осталось запросов: {status.rateRemaining}</ItemDescription>}
            </ItemContent>
            <ItemActions>
              <Button size="sm" variant="soft" onClick={() => navigate('/dev/github')}>
                Открыть
              </Button>
              <Confirm title="Отключить GitHub?" description="Токен будет удалён из Vault." confirmLabel="Отключить" onConfirm={() => disconnect.mutate({ token: '' })}>
                <Button size="sm" variant="ghost">
                  Отключить
                </Button>
              </Confirm>
            </ItemActions>
          </Item>
        ) : (
          <>
            {status?.error && <p className="text-caption text-destructive">{status.error}</p>}
            <GithubTokenField compact />
            <Button variant="link" className="self-start text-caption" onClick={() => navigate('/dev/github')}>
              Как создать токен — пошаговый гайд
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const STEPS = [
  'Откройте chrome://extensions в Chrome (или edge://extensions).',
  'Включите «Режим разработчика» справа сверху.',
  'Нажмите «Загрузить распакованное» и выберите папку расширения (кнопка ниже).',
  'В настройках расширения вставьте ключ и порт отсюда.',
  'Vault должен быть запущен (хватит иконки в трее).'
]

/** Settings → Chrome extension bridge: state, port, secret key, folder. */
export function ExtensionSettingsCard() {
  const { data: settings } = useApi('settings', 'get')
  const { data: info } = useApi('capture', 'info')
  const save = useApiMutation('settings', 'update')
  const regenerate = useApiMutation('capture', 'regenerateKey', { successMessage: 'Новый ключ создан — обновите его в расширении' })
  if (!settings) return null
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lead text-foreground">
          Расширение для Chrome
          {info && (
            <Badge variant={info.running ? 'lime' : 'soft'}>{info.running ? 'принимает' : settings.captureEnabled ? 'не запущено' : 'выключено'}</Badge>
          )}
        </CardTitle>
        <CardDescription className="text-caption">
          Сохраняйте сайты, дизайны, библиотеки, компоненты и вакансии одной кнопкой — со ссылкой и скриншотом. Связь только локальная (127.0.0.1) по секретному ключу.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Item size="sm" className="bg-card">
          <ItemContent>
            <ItemTitle className="font-normal">Принимать данные из расширения</ItemTitle>
            <ItemDescription className="text-caption">Порт {info?.port ?? settings.capturePort}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch checked={settings.captureEnabled} onCheckedChange={(captureEnabled) => save.mutate({ captureEnabled })} />
          </ItemActions>
        </Item>
        {info && (
          <InputGroup className="bg-card">
            <InputGroupAddon>Ключ</InputGroupAddon>
            <InputGroupInput readOnly value={info.token} className="font-mono text-caption" />
            <InputGroupAddon align="inline-end">
              <CopyButton text={info.token} variant="ghost" size="xs" />
              <Button size="icon-xs" variant="ghost" aria-label="Сгенерировать новый ключ" title="Сгенерировать новый" onClick={() => regenerate.mutate(undefined)}>
                <RefreshCw />
              </Button>
            </InputGroupAddon>
          </InputGroup>
        )}
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-caption text-muted-foreground">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Button variant="soft" className="self-start" onClick={() => api.capture.openExtensionDir()}>
          <FolderOpen /> Открыть папку расширения
        </Button>
      </CardContent>
    </Card>
  )
}
