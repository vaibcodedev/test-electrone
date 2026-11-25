import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useApiMutation } from '@/lib/query'
import { CopyButton } from '@/components/common/copy-button'
import { IconAction } from '@/components/common/icon-action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { Confirm } from '@/components/common/confirm'
import { SettingsRow, SettingsSection } from '@/features/settings/section'
import { GithubDisconnectButton, GithubTokenField } from './github-connect'

/** Settings → GitHub: connection status + token field. */
export function GithubSettingsCard(): ReactElement {
  const navigate = useNavigate()
  const { data: status } = useApi('github', 'status')
  return (
    <SettingsSection
      id="github"
      title="GitHub"
      hint="Репозиторії, issues і коміти в розділі «Розробка → GitHub». Токен лише на читання."
    >
      {status?.connected ? (
        <SettingsRow
          label={`Підключено як @${status.login}`}
          hint={
            status.rateRemaining !== null
              ? `Залишилося запитів: ${status.rateRemaining}`
              : undefined
          }
        >
          <Button size="sm" variant="soft" onClick={() => navigate('/dev/github')}>
            Відкрити
          </Button>
          <GithubDisconnectButton size="sm" />
        </SettingsRow>
      ) : (
        <>
          {status?.error && <p className="text-caption text-destructive">{status.error}</p>}
          <GithubTokenField compact submitVariant="subtle" />
          <Button
            variant="link"
            className="self-start text-caption"
            onClick={() => navigate('/dev/github')}
          >
            Як створити токен — покроковий гайд
          </Button>
        </>
      )}
    </SettingsSection>
  )
}

const STEPS = [
  'Відкрийте chrome://extensions у Chrome (або edge://extensions).',
  'Увімкніть «Режим розробника» праворуч угорі.',
  'Натисніть «Завантажити розпаковане» й виберіть папку розширення (кнопка нижче).',
  'У налаштуваннях розширення вставте ключ і порт звідси.',
  'Vault має бути запущений (досить іконки в треї).'
]

/** Settings → Chrome extension bridge: state, port, secret key, folder. */
export function ExtensionSettingsCard(): ReactElement | null {
  const { data: settings } = useApi('settings', 'get')
  const { data: info } = useApi('capture', 'info')
  const save = useApiMutation('settings', 'update')
  const regenerate = useApiMutation('capture', 'regenerateKey', {
    successMessage: 'Новий ключ створено — оновіть його в розширенні'
  })
  if (!settings) return null
  return (
    <SettingsSection
      id="extension"
      title="Розширення для Chrome"
      hint="Зберігайте сайти, дизайни, бібліотеки, компоненти й вакансії однією кнопкою — з посиланням і скриншотом. Зв’язок лише локальний (127.0.0.1) за секретним ключем."
    >
      {/* Labelled switch: a click on the title toggles it, and a screen reader names it. */}
      <SettingsRow
        label="Приймати дані з розширення"
        hint={`Порт ${info?.port ?? settings.capturePort}`}
      >
        {(id) => (
          <>
            {info && (
              <Badge variant={info.running ? 'success' : 'soft'}>
                {info.running ? 'приймає' : settings.captureEnabled ? 'не запущено' : 'вимкнено'}
              </Badge>
            )}
            <Switch
              id={id}
              checked={settings.captureEnabled}
              onCheckedChange={(captureEnabled) => save.mutate({ captureEnabled })}
            />
          </>
        )}
      </SettingsRow>
      {info && (
        <InputGroup className="bg-card">
          <InputGroupAddon>Ключ</InputGroupAddon>
          <InputGroupInput
            readOnly
            value={info.token}
            aria-label="Ключ розширення"
            className="font-mono text-caption"
          />
          <InputGroupAddon align="inline-end">
            <CopyButton text={info.token} variant="ghost" size="xs" />
            {/* A new key breaks the link with an extension already set up: ask first. */}
            <Confirm
              title="Створити новий ключ?"
              description="Розширення перестане зберігати, доки ви не вставите в нього новий ключ."
              confirmLabel="Створити ключ"
              tone="default"
              onConfirm={() => regenerate.mutate(undefined)}
            >
              <IconAction label="Створити новий ключ">
                <RefreshCw />
              </IconAction>
            </Confirm>
          </InputGroupAddon>
        </InputGroup>
      )}
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-caption text-muted-foreground">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Button variant="soft" className="self-start" onClick={() => api.capture.openExtensionDir()}>
        <FolderOpen /> Відкрити папку розширення
      </Button>
    </SettingsSection>
  )
}
