/**
 * Right column of the client page: in view mode a dl «мітка → значення» with actions, in edit mode
 * (RecordMode) the fields of the same groups.
 */
import { useId, useState, type ReactNode, type ReactElement } from 'react'
import { Copy, ExternalLink, Mail, Plus } from 'lucide-react'
import {
  clientInputSchema,
  type BillingType,
  type Client,
  type ClientPatch
} from '@shared/domain/crm'
import { EMAIL_ERROR, isLikelyEmail, isLikelyPhone, PHONE_ERROR } from '@shared/domain/common'
import { openUrl } from '@/lib/open-url'
import { useApi } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtMoney, fmtNumber, fmtPercent } from '@/lib/format'
import { copyText } from '@/components/common/copy-button'
import { SectionLabel } from '@/components/common/master-detail'
import { IconAction } from '@/components/common/icon-action'
import { NumberField } from '@/components/common/number-field'
import { useDetailMode } from '@/components/common/detail-mode-context'
import { LinkInput } from '@/components/common/text-field'
import { Field } from '@/components/common/page'
import { CurrencySelect } from '@/components/common/currency-select'
import { InfoList, InfoRow } from '@/components/common/info-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { BILLING_AMOUNT_LABEL, BILLING_LABEL, CURRENCY_SIGN, NO_PLATFORM } from './labels'
import { BillingPicker } from './parts'
import { ClientPlatformFields, PlatformName, PlatformSelect } from './platform-fields'

const CLIENT_L = limitsOf(clientInputSchema)
const CLIENT_R = rangesOf(clientInputSchema)

/** First contact field: «Додати контакти» turns editing on and puts the cursor here. */
const COMPANY_ID = 'client-company'

/** Aside group: title + content. View/edit comes from the record mode (one «Редагувати» per record). */
export function AsideGroup({
  title,
  children
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  )
}

const hasContacts = (c: Client): boolean =>
  !!(c.company || c.email || c.phone || c.messenger || c.website)

export function ContactsView({ c }: { c: Client }): ReactElement {
  const mode = useDetailMode()
  // Same pattern as «Доступи» and «Етапи оплати»: the empty group offers the step that fills it.
  // The aside is on card → soft.
  if (!hasContacts(c))
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-caption text-muted-foreground">Контактів ще немає.</p>
        <Button
          variant="soft"
          size="xs"
          onClick={() => {
            mode.setEditing(true)
            requestAnimationFrame(() => document.getElementById(COMPANY_ID)?.focus())
          }}
        >
          <Plus /> Додати контакти
        </Button>
      </div>
    )
  const copy = (text: string, message: string) => () => void copyText(text, message)
  return (
    <InfoList>
      {c.company && <InfoRow label="Компанія">{c.company}</InfoRow>}
      {c.email && (
        <InfoRow
          label="Email"
          actions={
            <>
              <IconAction
                className="text-muted-foreground"
                label={`Написати: ${c.email}`}
                onClick={() => void openUrl(`mailto:${c.email}`)}
              >
                <Mail />
              </IconAction>
              <IconAction
                className="text-muted-foreground"
                label="Скопіювати email"
                onClick={copy(c.email, 'Email скопійовано')}
              >
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
            <IconAction
              className="text-muted-foreground"
              label="Скопіювати телефон"
              onClick={copy(c.phone, 'Телефон скопійовано')}
            >
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
            <IconAction
              className="text-muted-foreground"
              label="Скопіювати месенджер"
              onClick={copy(c.messenger, 'Месенджер скопійовано')}
            >
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
              <IconAction
                className="text-muted-foreground"
                label="Відкрити сайт"
                onClick={() => void openUrl(c.website)}
              >
                <ExternalLink />
              </IconAction>
              <IconAction
                className="text-muted-foreground"
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
  key: 'company' | 'messenger'
  label: string
  placeholder: string
}[] = [
  { key: 'company', label: 'Компанія', placeholder: 'Напр.: Acme Studio' },
  { key: 'messenger', label: 'Месенджер', placeholder: 'Telegram @username' }
]

/**
 * A contact saved on blur after a loose check (email, phone): a value that fails stays in the field with an error
 * and isn't saved. An old value is never re-checked unless it is edited (per-field patches).
 */
function CheckedField({
  label,
  value,
  onSave,
  check,
  error,
  type,
  placeholder,
  maxLength
}: {
  label: string
  value: string
  onSave: (v: string) => void
  check: (v: string) => boolean
  error: string
  type: 'email' | 'tel'
  placeholder: string
  maxLength?: number
}): ReactElement {
  const [bad, setBad] = useState(false)
  const id = useId()
  return (
    <Field label={label} htmlFor={id} error={bad ? error : undefined}>
      <Input
        id={id}
        type={type}
        inputMode={type}
        defaultValue={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={bad || undefined}
        onChange={(e) => bad && setBad(!check(e.target.value))}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (!check(v)) return setBad(true)
          setBad(false)
          if (v !== value) onSave(v)
        }}
      />
    </Field>
  )
}

export function ContactsEdit({
  c,
  patch
}: {
  c: Client
  patch: (p: ClientPatch) => void
}): ReactElement {
  const uid = useId()
  const [company, messenger] = CONTACT_FIELDS
  const text = (f: (typeof CONTACT_FIELDS)[number]): ReactElement => {
    const id = f.key === 'company' ? COMPANY_ID : `${uid}-${f.key}`
    return (
      <Field key={f.key} label={f.label} htmlFor={id}>
        <Input
          id={id}
          defaultValue={c[f.key]}
          placeholder={f.placeholder}
          maxLength={CLIENT_L[f.key]}
          onBlur={(e) => e.target.value !== c[f.key] && patch({ [f.key]: e.target.value.trim() })}
        />
      </Field>
    )
  }
  return (
    <>
      {text(company)}
      <CheckedField
        label="Email"
        type="email"
        value={c.email}
        placeholder="name@company.com"
        maxLength={CLIENT_L.email}
        check={isLikelyEmail}
        error={EMAIL_ERROR}
        onSave={(email) => patch({ email })}
      />
      <CheckedField
        label="Телефон"
        type="tel"
        value={c.phone}
        placeholder="+380 67 123 45 67"
        maxLength={CLIENT_L.phone}
        check={isLikelyPhone}
        error={PHONE_ERROR}
        onSave={(phone) => patch({ phone })}
      />
      {text(messenger)}
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
  const { data: platforms, isLoading } = useApi('platforms', 'list')
  if (!c.platformId) return <p className="text-body">{NO_PLATFORM}</p>
  // The group is already called «Платформа»: its name goes first on its own, not as a «Платформа» row.
  const details =
    !!c.country ||
    !!c.rating ||
    c.totalSpent !== null ||
    c.hireRate !== null ||
    c.paymentVerified !== null
  return (
    <>
      {/* A client keeps no platform name of its own: while the list loads, or once the platform is deleted,
          the group still says where the client came from. */}
      {isLoading ? (
        <Skeleton className="h-5 w-24" />
      ) : platforms?.some((p) => p.id === c.platformId) ? (
        <PlatformName platformId={c.platformId} className="text-body font-medium" />
      ) : (
        <p className="text-body text-muted-foreground">Платформу видалено</p>
      )}
      {details && (
        <InfoList>
          {c.country && <InfoRow label="Країна">{c.country}</InfoRow>}
          {/* 0 is «no rating yet» (old records): the rating is 1–5. */}
          {!!c.rating && <InfoRow label="Рейтинг">{`★ ${fmtNumber(c.rating)}`}</InfoRow>}
          {c.totalSpent !== null && (
            <InfoRow label="Витрачено">{fmtMoney(c.totalSpent, c.currency)}</InfoRow>
          )}
          {c.hireRate !== null && <InfoRow label="Найм">{fmtPercent(c.hireRate)}</InfoRow>}
          {c.paymentVerified !== null && (
            <InfoRow label="Оплата">
              {c.paymentVerified ? 'верифікована' : 'не верифікована'}
            </InfoRow>
          )}
        </InfoList>
      )}
    </>
  )
}

export function SourceEdit({
  c,
  patch
}: {
  c: Client
  patch: (p: ClientPatch) => void
}): ReactElement {
  return (
    <>
      <PlatformSelect
        aria-label="Платформа"
        value={c.platformId}
        onChange={(platformId) => patch({ platformId })}
      />
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

/** «Ретейнер · 4 242 $/міс», «Погодинно · 40 $/год», «Фіксована ціна · бюджет 2 000 $». */
export function BillingView({ c }: { c: Client }): ReactElement {
  const amount = c.defaultRate > 0 ? fmtMoney(c.defaultRate, c.currency) : null
  const suffix =
    !amount || c.defaultBilling === 'none'
      ? ''
      : c.defaultBilling === 'hourly'
        ? ` · ${amount}/год`
        : c.defaultBilling === 'retainer'
          ? ` · ${amount}/міс`
          : ` · бюджет ${amount}`
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body">
        <span className="font-medium">{BILLING_LABEL[c.defaultBilling]}</span>
        {suffix}
      </p>
      <p className="text-caption text-muted-foreground">
        Валюта {c.currency}. Підставляється в нові проєкти клієнта, у проєкті можна змінити.
      </p>
    </div>
  )
}

export function BillingEdit({
  c,
  patch
}: {
  c: Client
  patch: (p: ClientPatch) => void
}): ReactElement {
  const uid = useId()
  const amountLabel = BILLING_AMOUNT_LABEL[c.defaultBilling]
  return (
    <>
      <BillingPicker
        value={c.defaultBilling}
        onChange={(defaultBilling: BillingType) => patch({ defaultBilling })}
      />
      <div className="grid grid-cols-2 items-start gap-2">
        <Field label="Валюта" htmlFor={`${uid}-currency`}>
          <CurrencySelect
            id={`${uid}-currency`}
            value={c.currency}
            onChange={(currency) => patch({ currency })}
          />
        </Field>
        {amountLabel && (
          <NumberField
            key={`rate-${c.defaultBilling}`}
            id={`${uid}-rate`}
            label={c.defaultBilling === 'fixed' ? 'Типовий бюджет' : amountLabel}
            value={c.defaultRate || null}
            {...CLIENT_R.defaultRate}
            unit={CURRENCY_SIGN[c.currency]}
            onCommit={(v) => patch({ defaultRate: v ?? 0 })}
          />
        )}
      </div>
      <p className="text-caption text-muted-foreground">
        Нові проєкти клієнта отримають цей тип оплати й суму.
      </p>
    </>
  )
}
