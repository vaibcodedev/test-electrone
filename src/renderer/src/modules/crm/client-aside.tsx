/**
 * Right column of the client page: read view by default (label → value rows with inline actions),
 * each group switches to its inputs with «Змінити» and back with «Готово». The page no longer
 * looks like a form stuck in edit mode (docs/design-system.md → Формы).
 */
import type { ReactNode } from 'react'
import { Copy, ExternalLink, Mail } from 'lucide-react'
import { toast } from 'sonner'
import type { Client, ProjectSummary } from '@shared/domain/crm'
import { api } from '@/lib/api'
import { fmtDay, fmtMoney, fmtPercent } from '@/lib/format'
import { copyText } from '@/components/common/copy-button'
import { SectionLabel } from '@/components/common/master-detail'
import { IconAction } from '@/components/common/icon-action'
import { BILLING_INFO } from './labels'
import { usePlatforms } from './platform-fields'

/** Aside group: title + content. View/edit comes from the record mode (one «Редагувати» per record). */
export function AsideGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  )
}

/** Definition list of label → value rows; empty values are skipped by the caller. */
export function InfoList({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-body">
      {children}
    </dl>
  )
}

export function InfoRow({
  label,
  children,
  actions
}: {
  label: string
  children: ReactNode
  actions?: ReactNode
}) {
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

const openExternal = (url: string): void => {
  api.app
    .openExternal(/^[a-z]+:/i.test(url) ? url : `https://${url}`)
    .catch((e: Error) => toast.error(e.message))
}

/** True when the client has at least one contact filled — a new client opens the group in edit mode. */
export const hasContacts = (c: Client): boolean =>
  !!(c.company || c.email || c.phone || c.messenger || c.website)

export function ContactsView({ c }: { c: Client }) {
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
                onClick={() => openExternal(`mailto:${c.email}`)}
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
              <IconAction className="text-muted-foreground" label="Відкрити сайт" onClick={() => openExternal(c.website)}>
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

export function SourceView({ c }: { c: Client }) {
  const platforms = usePlatforms()
  const p = c.platformId ? platforms.find((x) => x.id === c.platformId) : null
  if (!c.platformId) return <p className="text-body">Напряму, без платформи</p>
  return (
    <InfoList>
      <InfoRow label="Платформа">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ background: p?.color ?? 'var(--muted-foreground)' }}
          />
          {p?.name ?? '—'}
        </span>
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

/** «Ретейнер · 4 242 $ / міс», «Погодинно · 40 $ / год», «Фіксована ціна · бюджет 2 000 $». */
export function BillingView({ c }: { c: Client }) {
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

/** Project terms as text (view mode of the project page aside). */
export function ProjectTermsView({ project: p }: { project: ProjectSummary }) {
  const platforms = usePlatforms()
  const platform = p.platformId ? platforms.find((x) => x.id === p.platformId) : null
  const info = BILLING_INFO[p.billing]
  const amount = p.billing === 'hourly' ? p.rate : p.fixedPrice
  const money =
    amount > 0
      ? p.billing === 'hourly'
        ? `${fmtMoney(amount, p.currency)} / год`
        : p.billing === 'retainer'
          ? `${fmtMoney(amount, p.currency)} / міс`
          : fmtMoney(amount, p.currency)
      : null
  return (
    <InfoList>
      <InfoRow label="Платформа">
        {platform ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: platform.color ?? 'var(--muted-foreground)' }}
            />
            {platform.name}
          </span>
        ) : (
          'Напряму'
        )}
      </InfoRow>
      {platform && p.billing !== 'none' && (
        <InfoRow label="Комісія">{p.effectiveFeePercent}%</InfoRow>
      )}
      <InfoRow label="Оплата">{info.title}</InfoRow>
      {money && <InfoRow label={info.amountLabel ?? 'Сума'}>{money}</InfoRow>}
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
