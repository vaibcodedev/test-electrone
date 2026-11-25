import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { CaptureClient, CaptureInfo } from '@shared/domain/dev'
import { fmtDayFull } from '@/lib/format'
import { useApi, useApiMutation } from '@/lib/query'
import { CopyButton } from '@/components/common/copy-button'
import { IconAction } from '@/components/common/icon-action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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

const INSTALL_STEPS = [
  'Увімкніть «Режим розробника» праворуч угорі.',
  'Натисніть «Завантажити розпаковане».',
  'Вставте шлях (Ctrl+V) у поле «Папка» й натисніть «Вибрати папку».'
]

/** «Розширення Vault · …abcdef · з 25 листопада»: which extension got the key, and when. */
function clientLine(c: CaptureClient): string {
  const id = c.origin.slice(c.origin.indexOf('://') + 3)
  return `${c.vault ? 'Розширення Vault' : 'Інше розширення'} · …${id.slice(-6)} · з ${fmtDayFull(c.approvedAt)}`
}

/** Paired extensions and «Відключити» (a new key: every extension holding the old one stops saving). */
function ExtensionConnection({ info }: { info: CaptureInfo }): ReactElement {
  const regenerate = useApiMutation('capture', 'regenerateKey', {
    successMessage: 'Розширення відключено: ключ змінено'
  })
  if (!info.clients.length)
    return (
      <SettingsRow
        label="Розширення ще не під’єднано"
        hint="У розширенні натисніть «Під’єднати до Vault» і дозвольте доступ у вікні, що з’явиться тут."
      >
        <Badge variant="soft">не під’єднано</Badge>
      </SettingsRow>
    )
  return (
    <SettingsRow
      label={
        info.clients.length === 1 ? 'Під’єднано' : `Під’єднано розширень: ${info.clients.length}`
      }
      hint={
        <span className="flex flex-col">
          {info.clients.map((c) => (
            <span key={c.origin} className="truncate" title={c.origin}>
              {clientLine(c)}
            </span>
          ))}
        </span>
      }
    >
      <Confirm
        title="Відключити розширення?"
        description="Vault створить новий ключ: розширення перестане зберігати, доки ви не під’єднаєте його знову."
        confirmLabel="Відключити"
        tone="default"
        onConfirm={() => regenerate.mutate(undefined)}
      >
        <Button size="sm" variant="soft">
          Відключити
        </Button>
      </Confirm>
    </SettingsRow>
  )
}

/** «Встановити розширення»: a fresh folder, its path on the clipboard, Chrome on chrome://extensions. */
function ExtensionInstall({ info }: { info: CaptureInfo }): ReactElement {
  const install = useApiMutation('capture', 'installExtension', {
    onSuccess: ({ browserOpened }) => {
      if (browserOpened) toast.success('Шлях скопійовано, Chrome відкрито на сторінці розширень')
      else
        toast.info('Шлях скопійовано', {
          description: 'Chrome не знайдено — відкрийте в ньому chrome://extensions вручну.'
        })
    }
  })
  const openDir = useApiMutation('capture', 'openExtensionDir')
  return (
    <>
      <SettingsRow
        label="Встановити в Chrome"
        hint={
          info.extensionVersion
            ? `Версія ${info.extensionVersion} · оновлюється сама разом із Vault`
            : 'Оновлюється сама разом із Vault'
        }
      >
        <IconAction label="Відкрити папку розширення" onClick={() => openDir.mutate(undefined)}>
          <FolderOpen />
        </IconAction>
        <Button
          size="sm"
          variant="soft"
          disabled={install.isPending}
          onClick={() => install.mutate(undefined)}
        >
          Встановити розширення
        </Button>
      </SettingsRow>
      <p className="px-1 text-caption text-muted-foreground">
        Кнопка скопіює шлях до папки розширення й відкриє chrome://extensions. Далі:
      </p>
      <ol className="flex list-decimal flex-col gap-1 pl-6 text-caption text-muted-foreground">
        {INSTALL_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </>
  )
}

/** The old way, kept as a fallback: key and port pasted into the extension's settings by hand. */
function ExtensionManualKey({ info }: { info: CaptureInfo }): ReactElement {
  const [open, setOpen] = useState(false)
  const regenerate = useApiMutation('capture', 'regenerateKey', {
    successMessage: 'Новий ключ створено — під’єднайте розширення знову'
  })
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger asChild>
        <Button variant="link" className="self-start text-caption">
          {open ? 'Сховати ключ' : 'Ввести ключ вручну'}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2">
        <p className="text-caption text-muted-foreground">
          Запасний спосіб, якщо розширення не під’єднується саме: у його налаштуваннях вставте порт{' '}
          {info.port} і цей ключ.
        </p>
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
            {/* A new key breaks the link with every extension already set up: ask first. */}
            <Confirm
              title="Створити новий ключ?"
              description="Усі розширення перестануть зберігати, доки ви не під’єднаєте їх знову або не вставите новий ключ."
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
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Settings → Chrome extension bridge: on/off, pairing, installing, the manual key. */
export function ExtensionSettingsCard(): ReactElement | null {
  const { data: settings } = useApi('settings', 'get')
  const { data: info } = useApi('capture', 'info')
  const save = useApiMutation('settings', 'update')
  if (!settings) return null
  return (
    <SettingsSection
      id="extension"
      title="Розширення для Chrome"
      hint="Зберігайте сайти, код, дизайни, бібліотеки й вакансії однією кнопкою — з посиланням і скриншотом. Зв’язок лише локальний (127.0.0.1), доступ — тільки після вашого дозволу тут."
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
        <>
          <ExtensionConnection info={info} />
          <ExtensionInstall info={info} />
          <ExtensionManualKey info={info} />
        </>
      )}
    </SettingsSection>
  )
}
