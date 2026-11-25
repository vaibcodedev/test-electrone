import {
  Database,
  FolderUp,
  Globe,
  KeyRound,
  Mail,
  Server,
  Shapes,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import {
  DB_DEFAULT_PORT,
  DB_ENGINE_LABEL,
  DB_ENGINES,
  FTP_DEFAULT_PORT,
  FTP_PROTOCOLS,
  MAIL_DEFAULT_PORTS,
  MAIL_SECURITY,
  MAIL_SECURITY_LABEL,
  SSH_DEFAULT_PORT,
  type CredentialKind,
  type CredentialSecretField,
  type DbEngine,
  type FtpProtocol,
  type MailSecurity
} from '@shared/domain/credentials'

export const KIND_ICON: Record<CredentialKind, LucideIcon> = {
  account: UserRound,
  server: Server,
  database: Database,
  ftp: FolderUp,
  apiKey: KeyRound,
  hosting: Globe,
  mail: Mail,
  other: Shapes
}

/** Values of the credential form: columns + the kind's non-secret fields (secrets live in their own state). */
export type FormValues = Record<string, unknown>

/**
 * One field of a kind's form. `wide` takes the whole row (the form is two columns). Which fields are required, and
 * their limits, come from the kind's schema (requiredOf / limitsOf / rangesOf), not from here.
 */
export type FormField = { key: string; label: string; wide?: boolean } & (
  | { type: 'text'; placeholder?: string; mono?: boolean }
  | { type: 'url'; placeholder?: string }
  | { type: 'host'; placeholder?: string }
  | { type: 'port'; defaultPort: (v: FormValues) => number }
  | { type: 'secret'; key: 'secret' | CredentialSecretField; multiline?: boolean; hint?: string }
  | { type: 'choice'; options: { value: string; label: string }[]; segmented?: boolean }
  | { type: 'date' }
  | { type: 'switch' }
  | { type: 'pairs' }
)

const label: FormField = { key: 'label', label: 'Назва', type: 'text' }
const password: FormField = { key: 'secret', label: 'Пароль', type: 'secret' }
const user: FormField = { key: 'login', label: 'Користувач', type: 'text', mono: true }
const host: FormField = {
  key: 'host',
  label: 'Хост або IP',
  type: 'host',
  placeholder: '203.0.113.10'
}

/** The form of each kind, row by row: two narrow fields share a row, a wide one takes it. */
export const KIND_FORM: Record<CredentialKind, FormField[]> = {
  account: [
    { ...label, type: 'text', placeholder: 'Адмінка Shopify' },
    { key: 'url', label: 'Посилання', type: 'url', placeholder: 'https://' },
    { key: 'login', label: 'Логін або email', type: 'text', mono: true },
    password,
    {
      key: 'totp',
      label: 'Ключ 2FA',
      type: 'secret',
      wide: true,
      hint: 'Необов’язково. Ключ під QR-кодом або посилання otpauth:// — Vault показуватиме поточний код'
    },
    { key: 'backupCodes', label: 'Резервні коди', type: 'secret', multiline: true, wide: true }
  ],
  server: [
    { ...label, type: 'text', placeholder: 'Прод VPS' },
    { key: 'provider', label: 'Провайдер', type: 'text', placeholder: 'Hetzner, DigitalOcean…' },
    host,
    { key: 'port', label: 'Порт', type: 'port', defaultPort: () => SSH_DEFAULT_PORT },
    user,
    password,
    {
      key: 'keyPath',
      label: 'Шлях до файлу ключа',
      type: 'text',
      mono: true,
      placeholder: '~/.ssh/id_ed25519'
    },
    { key: 'passphrase', label: 'Passphrase ключа', type: 'secret' },
    { key: 'privateKey', label: 'Приватний SSH-ключ', type: 'secret', multiline: true, wide: true },
    { key: 'url', label: 'Панель провайдера', type: 'url', placeholder: 'https://', wide: true }
  ],
  database: [
    { ...label, type: 'text', placeholder: 'База магазину' },
    {
      key: 'engine',
      label: 'Тип бази',
      type: 'choice',
      options: DB_ENGINES.map((e) => ({ value: e, label: DB_ENGINE_LABEL[e] }))
    },
    host,
    {
      key: 'port',
      label: 'Порт',
      type: 'port',
      defaultPort: (v) => DB_DEFAULT_PORT[(v.engine as DbEngine) ?? 'postgresql']
    },
    { key: 'database', label: 'Назва бази', type: 'text', mono: true },
    { key: 'ssl', label: 'SSL', type: 'switch' },
    user,
    password
  ],
  ftp: [
    { ...label, type: 'text', placeholder: 'Файли сайту' },
    {
      key: 'protocol',
      label: 'Протокол',
      type: 'choice',
      segmented: true,
      options: FTP_PROTOCOLS.map((p) => ({ value: p, label: p.toUpperCase() }))
    },
    host,
    {
      key: 'port',
      label: 'Порт',
      type: 'port',
      defaultPort: (v) => FTP_DEFAULT_PORT[(v.protocol as FtpProtocol) ?? 'sftp']
    },
    user,
    password,
    {
      key: 'path',
      label: 'Папка',
      type: 'text',
      mono: true,
      placeholder: '/public_html',
      wide: true
    }
  ],
  apiKey: [
    { ...label, type: 'text', placeholder: 'Stripe — прод' },
    { key: 'service', label: 'Сервіс', type: 'text', placeholder: 'Stripe, OpenAI…' },
    { key: 'secret', label: 'Ключ', type: 'secret', wide: true },
    { key: 'scopes', label: 'Права (scopes)', type: 'text', placeholder: 'read, write' },
    { key: 'expiresAt', label: 'Діє до', type: 'date' },
    { key: 'url', label: 'Консоль сервісу', type: 'url', placeholder: 'https://', wide: true }
  ],
  hosting: [
    { ...label, type: 'text', placeholder: 'Хостинг сайту' },
    { key: 'domain', label: 'Домен', type: 'host', placeholder: 'example.com' },
    { key: 'url', label: 'Панель', type: 'url', placeholder: 'https://', wide: true },
    { key: 'login', label: 'Логін', type: 'text', mono: true },
    password,
    { key: 'renewAt', label: 'Продовжити до', type: 'date' }
  ],
  mail: [
    { ...label, type: 'text', placeholder: 'Пошта info@' },
    {
      key: 'security',
      label: 'Шифрування',
      type: 'choice',
      options: MAIL_SECURITY.map((s) => ({ value: s, label: MAIL_SECURITY_LABEL[s] }))
    },
    { key: 'host', label: 'Сервер', type: 'host', placeholder: 'mail.example.com', wide: true },
    {
      key: 'smtpPort',
      label: 'Порт SMTP',
      type: 'port',
      defaultPort: (v) => MAIL_DEFAULT_PORTS[(v.security as MailSecurity) ?? 'ssl'].smtp
    },
    {
      key: 'imapPort',
      label: 'Порт IMAP',
      type: 'port',
      defaultPort: (v) => MAIL_DEFAULT_PORTS[(v.security as MailSecurity) ?? 'ssl'].imap
    },
    { key: 'login', label: 'Користувач (email)', type: 'text', mono: true },
    password
  ],
  other: [
    { ...label, type: 'text', placeholder: 'Доступ до CRM клієнта', wide: true },
    { key: 'pairs', label: 'Поля', type: 'pairs', wide: true }
  ]
}

/** What a new form of the kind starts with (selects pre-picked, so «Додати» waits only for typed fields). */
export const KIND_START: Partial<Record<string, unknown>> = {
  engine: 'postgresql',
  protocol: 'sftp',
  security: 'ssl',
  ssl: false,
  port: null,
  smtpPort: null,
  imapPort: null,
  expiresAt: null,
  renewAt: null
}
