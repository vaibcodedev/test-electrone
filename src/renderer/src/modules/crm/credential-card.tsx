import { useEffect, useRef, useState, type ReactNode, type ReactElement } from 'react'
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  ShieldCheck,
  Terminal,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CLIPBOARD_CLEAR_SECONDS,
  connectionString,
  CREDENTIAL_KIND_LABEL,
  credentialMainLine,
  DB_DEFAULT_PORT,
  DB_ENGINE_LABEL,
  FTP_DEFAULT_PORT,
  MAIL_DEFAULT_PORTS,
  MAIL_SECURITY_LABEL,
  serverPort,
  sshCommand,
  type Credential,
  type CredentialCopy,
  type CredentialSecretRef
} from '@shared/domain/credentials'
import { api } from '@/lib/api'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDayFull, hostOf } from '@/lib/format'
import { openUrl } from '@/lib/open-url'
import { reportError } from '@/lib/error-reporting'
import { cn } from '@/lib/utils'
import { copyText } from '@/components/common/copy-button'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { useDetailMode } from '@/components/common/detail-mode-context'
import { EditHintText } from '@/components/common/detail-mode'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { KIND_ICON } from './credential-kinds'
import { CredentialForm, type CredentialOwner, type OwnerChoice } from './credential-form'
import { CredentialPayment } from './credential-payment'
import { useInlineForm } from './inline-form'

/** «Показати» shows a secret this long, then hides it again. */
const REVEAL_MS = 10_000

const DAY_MS = 86_400_000

/**
 * One value cell (Хост, Логін, Пароль…): label on top, monospace value, its actions on the right. `full` — the whole
 * value for the tooltip of a cut one (never a secret).
 */
function ValueCell({
  label,
  value,
  full,
  wide,
  children
}: {
  label: string
  value: ReactNode
  full?: string
  wide?: boolean
  children?: ReactNode
}): ReactElement {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xl bg-card px-3 py-2',
        wide && 'sm:col-span-2'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-meta text-muted-foreground">{label}</div>
        <div className="selectable truncate font-mono text-body" title={full}>
          {value}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center">{children}</div>}
    </div>
  )
}

/** A plain value with «Скопіювати». */
function PlainCell({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <ValueCell label={label} value={value} full={value}>
      <IconAction
        label={`Скопіювати: ${label.toLowerCase()}`}
        onClick={() => void copyText(value, `${label} — скопійовано`)}
      >
        <Copy />
      </IconAction>
    </ValueCell>
  )
}

/** Copies a secret in main: it never passes through the renderer, and the clipboard clears itself in 30 s. */
async function copySecret(arg: CredentialCopy, what: string): Promise<void> {
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

/**
 * A secret: dots, «Показати» for 10 s, «Скопіювати» (main copies it and clears the clipboard in 30 s). The value
 * is asked for only on «Показати» and forgotten when it hides.
 */
function SecretCell({
  label,
  secret,
  multiline
}: {
  label: string
  secret: CredentialSecretRef
  multiline?: boolean
}): ReactElement {
  const [shown, setShown] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const hide = (): void => {
    clearTimeout(timer.current)
    setShown(null)
  }
  const show = async (): Promise<void> => {
    try {
      const value = await api.credentials.reveal(secret)
      setShown(value)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setShown(null), REVEAL_MS)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const lower = label.toLowerCase()
  return (
    <ValueCell
      label={label}
      wide={multiline && shown !== null}
      value={
        shown === null ? (
          '••••••••••'
        ) : multiline ? (
          <span className="block max-h-40 overflow-auto whitespace-pre-wrap break-all">
            {shown}
          </span>
        ) : (
          shown
        )
      }
    >
      <IconAction
        label={shown !== null ? `Сховати: ${lower}` : `Показати: ${lower}`}
        onClick={() => (shown !== null ? hide() : void show())}
      >
        {shown !== null ? <EyeOff /> : <Eye />}
      </IconAction>
      <IconAction label={`Скопіювати: ${lower}`} onClick={() => void copySecret(secret, label)}>
        <Copy />
      </IconAction>
    </ValueCell>
  )
}

/** The current 2FA code with its countdown; main computes it, the key never leaves main. */
function TotpCell({ id }: { id: string }): ReactElement {
  const { data, refetch, isError } = useApi('credentials', 'totp', id, {
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false
  })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = data ? Math.max(0, Math.ceil((data.expiresAt - now) / 1000)) : 0
  useEffect(() => {
    if (data && left === 0) void refetch()
  }, [data, left, refetch])
  const code = data && left > 0 ? data.code : null
  const pretty = code ? code.replace(/^(\d{3})(\d{3})$/, '$1 $2') : '••• •••'
  return (
    <ValueCell
      label="Код 2FA"
      value={
        <span className="flex items-baseline gap-2">
          <span className="tabular-nums" data-totp-code>
            {isError ? 'недоступний' : pretty}
          </span>
          {code && (
            <span className="font-sans text-meta text-muted-foreground tabular-nums">
              ще {left} с
            </span>
          )}
        </span>
      }
    >
      <IconAction
        label="Скопіювати код 2FA"
        disabled={!code}
        onClick={() => code && void copyText(code, 'Код 2FA скопійовано')}
      >
        <Copy />
      </IconAction>
    </ValueCell>
  )
}

/** The cells of the kind, in reading order; empty ones aren't drawn («—» looked like data). */
function cellsOf(item: Credential): ReactElement[] {
  const f = item.fields
  const cells: ReactElement[] = []
  const plain = (label: string, value: string | number | null | undefined): void => {
    if (value === null || value === undefined || value === '') return
    cells.push(<PlainCell key={`p:${label}`} label={label} value={String(value)} />)
  }
  const secret = (
    label: string,
    field: CredentialSecretRef['field'],
    multiline?: boolean
  ): void => {
    cells.push(
      <SecretCell
        key={`s:${label}`}
        label={label}
        secret={{ id: item.id, field }}
        multiline={multiline}
      />
    )
  }
  const has = (k: (typeof item.secretsSet)[number]): boolean => item.secretsSet.includes(k)
  const password = (label = 'Пароль'): void => {
    if (item.hasSecret) secret(label, 'secret')
  }
  switch (item.kind) {
    case 'account':
      plain('Логін', item.login)
      password()
      if (has('totp')) cells.push(<TotpCell key="totp" id={item.id} />)
      if (has('backupCodes')) secret('Резервні коди', 'backupCodes', true)
      break
    case 'server':
      plain('Хост', f.host)
      plain('Порт', serverPort(f))
      plain('Користувач', item.login)
      password()
      if (has('privateKey')) secret('SSH-ключ', 'privateKey', true)
      if (has('passphrase')) secret('Passphrase', 'passphrase')
      plain('Файл ключа', f.keyPath)
      plain('Провайдер', f.provider)
      break
    case 'database':
      plain('Хост', f.host)
      plain('Порт', f.port ?? DB_DEFAULT_PORT[f.engine ?? 'postgresql'])
      plain('База', f.database)
      plain('Користувач', item.login)
      password()
      break
    case 'ftp':
      plain('Хост', f.host)
      plain('Порт', f.port ?? FTP_DEFAULT_PORT[f.protocol ?? 'sftp'])
      plain('Користувач', item.login)
      password()
      plain('Папка', f.path)
      break
    case 'apiKey':
      // The service is the main line already (with its own «Скопіювати»).
      password('Ключ')
      plain('Права', f.scopes)
      break
    case 'hosting':
      plain('Домен', f.domain)
      plain('Логін', item.login)
      password()
      break
    case 'mail': {
      const ports = MAIL_DEFAULT_PORTS[f.security ?? 'ssl']
      plain('Сервер', f.host)
      plain('Порт SMTP', f.smtpPort ?? ports.smtp)
      plain('Порт IMAP', f.imapPort ?? ports.imap)
      plain('Користувач', item.login)
      password()
      break
    }
    case 'other':
      for (const p of f.pairs ?? []) {
        if (p.secret) {
          if (p.hasValue) secret(p.name, { pair: p.name })
        } else plain(p.name, p.value)
      }
      break
  }
  return cells
}

/** What the kind's badges say next to the main line: the DB engine, SSL, the mail encryption. */
function kindDetails(item: Credential): string[] {
  const f = item.fields
  if (item.kind === 'database')
    return [DB_ENGINE_LABEL[f.engine ?? 'postgresql'], ...(f.ssl ? ['SSL'] : [])]
  if (item.kind === 'ftp') return [(f.protocol ?? 'sftp').toUpperCase()]
  if (item.kind === 'mail') return [MAIL_SECURITY_LABEL[f.security ?? 'ssl']]
  return []
}

/** «Діє до 3 грудня» / «Продовжити до …»: warn within 14 days, red once passed. */
function TermBadge({ item }: { item: Credential }): ReactElement | null {
  const [now] = useState(() => Date.now())
  const at =
    item.kind === 'apiKey'
      ? item.fields.expiresAt
      : item.kind === 'hosting'
        ? item.fields.renewAt
        : null
  if (!at) return null
  const days = (at - now) / DAY_MS
  const text = `${item.kind === 'apiKey' ? 'Діє до' : 'Продовжити до'} ${fmtDayFull(at)}`
  return (
    <Badge variant={days < 0 ? 'destructive' : days <= 14 ? 'warn' : 'soft'}>
      {days < 0 && item.kind === 'apiKey' ? `Сплив ${fmtDayFull(at)}` : text}
    </Badge>
  )
}

/** The kind's quick actions: the SSH command, the DB string (with the password from the menu), the site. */
function QuickActions({ item }: { item: Credential }): ReactElement | null {
  const site = (item.kind === 'account' || item.kind === 'hosting') && item.url
  if (item.kind === 'server' && item.fields.host)
    return (
      <Button
        variant="soft"
        size="xs"
        onClick={() => void copyText(sshCommand(item), 'Команду SSH скопійовано')}
      >
        <Terminal /> Скопіювати команду SSH
      </Button>
    )
  if (item.kind === 'database' && item.fields.host)
    return (
      <ButtonGroup>
        <Button
          variant="soft"
          size="xs"
          onClick={() => void copyText(connectionString(item), 'Рядок підключення скопійовано')}
        >
          <Copy /> Скопіювати рядок підключення
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="soft" size="icon-xs" aria-label="Інші варіанти рядка підключення">
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() =>
                  void copyText(connectionString(item), 'Рядок підключення скопійовано')
                }
              >
                Без пароля
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!item.hasSecret}
                onSelect={() =>
                  void copySecret(
                    { id: item.id, field: 'connectionWithPassword' },
                    'Рядок із паролем'
                  )
                }
              >
                З паролем
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    )
  if (site)
    return (
      <Button variant="soft" size="xs" onClick={() => void openUrl(item.url)}>
        <ExternalLink /> Відкрити сайт
      </Button>
    )
  return null
}

/**
 * An access card, password-manager style: the kind's icon, the name and the main line (`user@host:22`), the kind's
 * quick action, then a cell per field with «Скопіювати» right next to the value, the payment and the term.
 */
export function CredentialCard({
  item,
  owner,
  owners
}: {
  item: Credential
  owner: CredentialOwner
  /** The client page: its pencil can move the access between the client and its projects. */
  owners?: OwnerChoice
}): ReactElement {
  const mode = useDetailMode()
  const [editing, setEditing] = useInlineForm('доступ')
  const remove = useApiMutation('credentials', 'remove', { successMessage: 'Доступ видалено' })

  if (editing)
    return (
      <CredentialForm
        initial={item}
        owner={owner}
        owners={owners}
        onDone={() => setEditing(false)}
      />
    )

  const Icon = KIND_ICON[item.kind]
  const line = credentialMainLine(item)
  const host = item.url ? hostOf(item.url) : ''
  const cells = cellsOf(item)
  const details = kindDetails(item)
  const quick = <QuickActions item={item} />
  return (
    <Card className="group gap-3 bg-surface p-4" data-credential={item.kind}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.07] text-muted-foreground">
          <Icon className="size-4" />
          <span className="sr-only">{CREDENTIAL_KIND_LABEL[item.kind]}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold" title={item.label}>
            {item.label}
          </div>
          {line && (
            <div
              className="selectable truncate font-mono text-meta text-muted-foreground"
              title={line}
              data-credential-line
            >
              {line}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {line && (
            <IconAction label="Скопіювати головний рядок" onClick={() => void copyText(line)}>
              <Copy />
            </IconAction>
          )}
          {item.url && item.kind !== 'account' && item.kind !== 'hosting' && (
            <IconAction label={`Відкрити ${host}`} onClick={() => void openUrl(item.url)}>
              <ExternalLink />
            </IconAction>
          )}
          <span data-edit-only className="flex items-center gap-0.5">
            <IconAction label="Змінити доступ" onClick={() => setEditing(true)}>
              <Pencil />
            </IconAction>
            <Confirm
              title={`Видалити доступ «${item.label}»?`}
              description="Паролі й ключі буде видалено без можливості відновлення. Підписка, якщо є, залишиться у Фінансах."
              onConfirm={() => remove.mutate(item.id)}
            >
              <IconAction label="Видалити доступ" className="hover:text-destructive">
                <Trash2 />
              </IconAction>
            </Confirm>
          </span>
        </div>
      </div>
      {(details.length > 0 || item.secretsSet.includes('totp')) && (
        <div className="flex flex-wrap gap-1.5">
          {details.map((d) => (
            <Badge key={d}>{d}</Badge>
          ))}
          {item.secretsSet.includes('totp') && (
            <Badge>
              <ShieldCheck /> 2FA
            </Badge>
          )}
        </div>
      )}
      {cells.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">{cells}</div>
      ) : (
        // Editing: the row's pencil is right above, so the hint only says what is missing.
        <p className="text-caption text-muted-foreground">
          Логін і пароль ще не додано.
          {!mode.editing && (
            <>
              {' '}
              <EditHintText />
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {quick}
        <TermBadge item={item} />
      </div>
      <CredentialPayment item={item} />
      {item.notes && (
        <p className="line-clamp-2 text-caption text-muted-foreground">{item.notes}</p>
      )}
    </Card>
  )
}
