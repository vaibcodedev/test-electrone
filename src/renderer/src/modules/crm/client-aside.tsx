/**
 * Right column of the client page: in view mode a dl «мітка → значення» with actions, in edit mode
 * (RecordMode) the fields of the same groups.
 */
import { useId, useState, type ReactNode, type ReactElement } from 'react'
import { Copy, ExternalLink, Mail } from 'lucide-react'
import {
  clientInputSchema,
  CURRENCIES,
  type BillingType,
  type Client,
  type ClientPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { EMAIL_ERROR, isLikelyEmail } from '@shared/domain/common'
import { openUrl } from '@/lib/open-url'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtDay, fmtMoney, fmtPercent } from '@/lib/format'
import { copyText } from '@/components/common/copy-button'
import { SectionLabel } from '@/components/common/master-detail'
import { IconAction } from '@/components/common/icon-action'
import { NumberInput } from '@/components/common/number-input'
import { LinkInput } from '@/components/common/text-field'
import { Field } from '@/components/common/page'
import { Input } from '@/components/ui/input'
import { BILLING_INFO, NO_PLATFORM } from './labels'
import { BillingPicker, Choice } from './parts'
import { ClientPlatformFields, PlatformName, PlatformSelect } from './platform-fields'

const CLIENT_L = limitsOf(clientInputSchema)
const CLIENT_R = rangesOf(clientInputSchema)

/** Aside group: title + content. View/edit comes from the record mode (one «Редагувати» per record). */
export function AsideGroup({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  )
}

/** Definition list of label → value rows; empty values are skipped by the caller. */
function InfoList({ children }: { children: ReactNode }): ReactElement {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-body">
      {children}
    </dl>
  )
}

function InfoRow({
  label,
  children,
  actions
}: {
  label: string
  children: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className="selectable min-w-0 truncate">{children}</span>
        {actions && <span className="ml-auto flex shrink-0 items-center">{actions}</span>}
      </dd>
    </>
  )
}

/** Є хоч один контакт. */
const hasContacts = (c: Client): boolean =>
  !!(c.company || c.email || c.phone || c.messenger || c.website)

export function ContactsView({ c }: { c: Client }): ReactElement {
  if (!hasContacts(c))
    return <p className="text-caption text-muted-foreground">Контактів ще немає.</p>
  const copy = (text: string, message: string) => () => void copyText(text, message)
  return (
    <InfoList>
      {c.company && <InfoRow label="Компанія">{c.company}</InfoRow>}
      {c.email && (
        <InfoRow
          label="Email"
          actions={
            <>
              <IconAction className="text-muted-foreground"
                label={`Написати: ${c.email}`}
                onClick={() => void openUrl(`mailto:${c.email}`)}
              >
                <Mail />
              </IconAction>
              <IconAction className="text-muted-foreground" label="Скопіювати пошту" onClick={copy(c.email, 'Пошту скопійовано')}>
                <Copy />
              </IconAction>
            </>
          }
        >
          {c.email}
        </InfoRow>
      )}
      {c.phone && (
        <InfoRow
          label="Телефон"
          actions={
            <IconAction className="text-muted-foreground" label="Скопіювати телефон" onClick={copy(c.phone, 'Телефон скопійовано')}>
              <Copy />
            </IconAction>
          }
        >
          {c.phone}
        </InfoRow>
      )}
      {c.messenger && (
        <InfoRow
          label="Месенджер"
          actions={
            <IconAction className="text-muted-foreground" label="Скопіювати" onClick={copy(c.messenger, 'Скопійовано')}>
              <Copy />
            </IconAction>
          }
        >
          {c.messenger}
        </InfoRow>
      )}
      {c.website && (
        <InfoRow
          label="Сайт"
          actions={
            <>
              <IconAction className="text-muted-foreground" label="Відкрити сайт" onClick={() => void openUrl(c.website)}>
                <ExternalLink />
              </IconAction>
              <IconAction className="text-muted-foreground"
                label="Скопіювати посилання"
                onClick={copy(c.website, 'Посилання скопійовано')}
              >
                <Copy />
              </IconAction>
            </>
          }
        >
          {c.website.replace(/^https?:\/\/(www\.)?/i, '')}
        </InfoRow>
      )}
    </InfoList>
  )
}

const CONTACT_FIELDS: {
  key: 'company' | 'phone' | 'messenger'
  label: string
  placeholder: string
}[] = [
  { key: 'company', label: 'Компанія', placeholder: 'Bloom Store' },
  { key: 'phone', label: 'Телефон', placeholder: '+380…' },
  { key: 'messenger', label: 'Месенджер', placeholder: 'Telegram @username' }
]

/** Email saved on blur; a value that isn't an email stays in the field with an error and isn't saved. */
function EmailField({ value, onSave }: { value: string; onSave: (v: string) => void }): ReactElement {
  const [bad, setBad] = useState(false)
  const id = useId()
  return (
    <Field label="Email" htmlFor={id} error={bad ? EMAIL_ERROR : undefined}>
      <Input
        id={id}
        type="email"
        defaultValue={value}
        placeholder="name@company.com"
        maxLength={CLIENT_L.email}
        aria-invalid={bad || undefined}
        onChange={(e) => bad && setBad(!isLikelyEmail(e.target.value))}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (!isLikelyEmail(v)) return setBad(true)
          setBad(false)
          if (v !== value) onSave(v)
        }}
      />
    </Field>
  )
}

export function ContactsEdit({ c, patch }: { c: Client; patch: (p: ClientPatch) => void }): ReactElement {
  const uid = useId()
  const [company, ...rest] = CONTACT_FIELDS
  const text = (f: (typeof CONTACT_FIELDS)[number]): ReactElement => (
    <Field key={f.key} label={f.label} htmlFor={`${uid}-${f.key}`}>
      <Input
        id={`${uid}-${f.key}`}
        defaultValue={c[f.key]}
        placeholder={f.placeholder}
        maxLength={CLIENT_L[f.key]}
        onBlur={(e) => e.target.value !== c[f.key] && patch({ [f.key]: e.target.value.trim() })}
      />
    </Field>
  )
  return (
    <>
      {text(company)}
      <EmailField value={c.email} onSave={(email) => patch({ email })} />
      {rest.map(text)}
      <LinkInput
        label="Сайт"
        value={c.website}
        placeholder="https://"
        maxLength={CLIENT_L.website}
        openLabel="Відкрити сайт"
        onSave={(website) => patch({ website })}
      />
    </>
  )
}

export function SourceView({ c }: { c: Client }): ReactElement {
  if (!c.platformId) return <p className="text-body">{NO_PLATFORM}</p>
  return (
    <InfoList>
      <InfoRow label="Платформа">
        <PlatformName platformId={c.platformId} />
      </InfoRow>
      {c.country && <InfoRow label="Країна">{c.country}</InfoRow>}
      {c.rating !== null && <InfoRow label="Рейтинг">★ {c.rating}</InfoRow>}
      {c.totalSpent !== null && (
        <InfoRow label="Витрачено">{fmtMoney(c.totalSpent, c.currency)}</InfoRow>
      )}
      {c.hireRate !== null && <InfoRow label="Найм">{fmtPercent(c.hireRate)}</InfoRow>}
      {c.paymentVerified !== null && (
        <InfoRow label="Оплата">{c.paymentVerified ? 'верифікована' : 'не верифікована'}</InfoRow>
      )}
    </InfoList>
  )
}

export function SourceEdit({ c, patch }: { c: Client; patch: (p: ClientPatch) => void }): ReactElement {
  return (
    <>
      <PlatformSelect value={c.platformId} onChange={(platformId) => patch({ platformId })} />
      {c.platformId && (
        <ClientPlatformFields
          key={`pf-${c.platformId}`}
          currency={c.currency}
          value={c}
          onChange={(p) => patch(p)}
        />
      )}
    </>
  )
}

/** «Ретейнер · 4 242 $ / міс», «Погодинно · 40 $ / год», «Фіксована ціна · бюджет 2 000 $». */
export function BillingView({ c }: { c: Client }): ReactElement {
  const info = BILLING_INFO[c.defaultBilling]
  const amount = c.defaultRate > 0 ? fmtMoney(c.defaultRate, c.currency) : null
  const suffix =
    !amount || c.defaultBilling === 'none'
      ? ''
      : c.defaultBilling === 'hourly'
        ? ` · ${amount} / год`
        : c.defaultBilling === 'retainer'
          ? ` · ${amount} / міс`
          : ` · бюджет ${amount}`
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body">
        <span className="font-medium">{info.title}</span>
        {suffix}
      </p>
      <p className="text-caption text-muted-foreground">
        Валюта {c.currency}. Нові проєкти клієнта отримають ці умови.
      </p>
    </div>
  )
}

export function BillingEdit({ c, patch }: { c: Client; patch: (p: ClientPatch) => void }): ReactElement {
  const uid = useId()
  const amountLabel = BILLING_INFO[c.defaultBilling].amountLabel
  return (
    <>
      <BillingPicker
        value={c.defaultBilling}
        onChange={(defaultBilling: BillingType) => patch({ defaultBilling })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Валюта" htmlFor={`${uid}-currency`}>
          <Choice
            id={`${uid}-currency`}
            value={c.currency}
            onChange={(v) => v && patch({ currency: v })}
            options={CURRENCIES.map((x) => ({ value: x, label: x }))}
          />
        </Field>
        {amountLabel && (
          <Field
            key={`rate-${c.defaultBilling}`}
            label={c.defaultBilling === 'fixed' ? 'Типовий бюджет' : amountLabel}
            htmlFor={`${uid}-rate`}
          >
            <NumberInput
              id={`${uid}-rate`}
              value={c.defaultRate || null}
              allowEmpty
              {...CLIENT_R.defaultRate}
              onChange={(v) => patch({ defaultRate: v ?? 0 })}
            />
          </Field>
        )}
      </div>
      <p className="text-meta text-muted-foreground">Нові проєкти клієнта отримають ці умови.</p>
    </>
  )
}

/** Project terms as text (view mode of the project page aside); price and platform are in the header. */
export function ProjectTermsView({ project: p }: { project: ProjectSummary }): ReactElement {
  return (
    <InfoList>
      {p.platformId && p.billing !== 'none' && (
        <InfoRow label="Комісія">{fmtPercent(p.effectiveFeePercent)}</InfoRow>
      )}
      <InfoRow label="Оплата">{BILLING_INFO[p.billing].title}</InfoRow>
      {p.billing === 'hourly' && p.budgetHours > 0 && (
        <InfoRow label="Бюджет">{p.budgetHours} год</InfoRow>
      )}
      {p.startAt && (
        <InfoRow label={p.billing === 'retainer' ? 'Ретейнер з' : 'Початок'}>
          {fmtDay(p.startAt)}
        </InfoRow>
      )}
      {p.dueAt && (
        <InfoRow label={p.billing === 'retainer' ? 'До' : 'Дедлайн'}>{fmtDay(p.dueAt)}</InfoRow>
      )}
    </InfoList>
  )
}
