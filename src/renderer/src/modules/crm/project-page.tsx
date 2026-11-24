import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  CURRENCIES,
  PROJECT_STATUSES,
  type BillingType,
  type ProjectPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtHours, fmtMoney, plural } from '@/lib/format'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState, Field } from '@/components/common/page'
import { EntityAside, InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { DatePicker } from '@/components/common/date-picker'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'
import { BILLING_INFO, PROJECT_STATUS_LABEL } from './labels'
import { BillingPicker, Choice, Meter, Section } from './parts'
import { amountPatch, numberOrZero } from './money'
import { TimeSection } from './time-section'
import { PaymentsSection } from './payments-section'
import { CredentialsSection } from './credentials-section'
import { FeeField, NetPaid, PlatformBadge, PlatformSelect, usePlatforms } from './platform-fields'

function Money({
  label,
  value,
  tone,
  hint
}: {
  label: string
  value: ReactNode
  tone?: 'lime' | 'warn'
  hint?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-display w-fit text-[28px] leading-tight tabular-nums',
          tone === 'lime' && 'rounded-xl bg-lime px-2 text-lime-foreground',
          tone === 'warn' && 'text-warn'
        )}
      >
        {value}
      </span>
      {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** Money header that speaks the language of the billing type. */
function MoneyHeader({ p }: { p: ProjectSummary }) {
  const m = (n: number): string => fmtMoney(n, p.currency)
  const rate = p.effectiveRate ? `${m(p.effectiveRate)} / ч` : '—'
  const hours = (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-muted-foreground">Часы</span>
      <span className="font-display text-[28px] leading-tight tabular-nums">
        {fmtHours(p.trackedMinutes)}
        {p.budgetHours > 0 && (
          <span className="text-[16px] text-muted-foreground"> / {p.budgetHours} ч</span>
        )}
      </span>
      {p.budgetHours > 0 && <Meter value={p.trackedMinutes / 60} max={p.budgetHours} />}
    </div>
  )
  let cells: ReactNode
  switch (p.billing) {
    case 'hourly':
      cells = (
        <>
          <Money label="Заработано" value={m(p.earnedAmount)} hint={`${m(p.rate)} / ч`} />
          <Money label="Оплачено" value={m(p.paidAmount)} tone="lime" />
          <Money
            label="Ожидается"
            value={m(p.outstandingAmount)}
            tone={p.outstandingAmount > 0 ? 'warn' : undefined}
          />
          {hours}
        </>
      )
      break
    case 'fixed':
      cells = (
        <>
          <Money label="Стоимость проекта" value={m(p.fixedPrice)} />
          <div className="flex flex-col gap-1">
            <Money label="Оплачено" value={m(p.paidAmount)} tone="lime" />
            {p.fixedPrice > 0 && <Meter value={p.paidAmount} max={p.fixedPrice} />}
          </div>
          <Money
            label="Осталось получить"
            value={m(p.outstandingAmount)}
            tone={p.outstandingAmount > 0 ? 'warn' : undefined}
          />
          <Money
            label="Фактическая ставка"
            value={rate}
            hint={`${fmtHours(p.trackedMinutes)} учтено`}
          />
        </>
      )
      break
    case 'retainer':
      cells = (
        <>
          <Money
            label="Абонемент"
            value={m(p.fixedPrice)}
            hint={`в месяц · ${p.retainerMonths} ${plural(p.retainerMonths, ['месяц', 'месяца', 'месяцев'])}`}
          />
          <Money label="Оплачено" value={m(p.paidAmount)} tone="lime" />
          <Money
            label="Ожидается"
            value={m(p.outstandingAmount)}
            tone={p.outstandingAmount > 0 ? 'warn' : undefined}
          />
          <Money
            label="Фактическая ставка"
            value={rate}
            hint={`${fmtHours(p.trackedMinutes)} учтено`}
          />
        </>
      )
      break
    default:
      cells = (
        <>
          {hours}
          <div className="col-span-3 self-center text-[13px] text-muted-foreground">
            Проект без оплаты — ведётся только учёт времени.
          </div>
        </>
      )
  }
  return <Card className="mt-6 grid grid-cols-4 gap-6 p-6">{cells}</Card>
}

const LINK_FIELDS: {
  key: 'repoUrl' | 'stagingUrl' | 'prodUrl' | 'adminUrl'
  label: string
  placeholder: string
}[] = [
  { key: 'prodUrl', label: 'Прод', placeholder: 'https://store.com' },
  { key: 'stagingUrl', label: 'Стейджинг', placeholder: 'https://staging…' },
  { key: 'adminUrl', label: 'Админка', placeholder: 'https://admin.shopify.com/…' },
  { key: 'repoUrl', label: 'Репозиторий', placeholder: 'https://github.com/…' }
]

function UrlField({
  label,
  value,
  placeholder,
  onSave
}: {
  label: string
  value: string
  placeholder: string
  onSave: (v: string) => void
}) {
  return (
    <Field label={label}>
      <ButtonGroup className="w-full">
        <Input
          defaultValue={value}
          placeholder={placeholder}
          onBlur={(e) => e.target.value !== value && onSave(e.target.value.trim())}
        />
        {value && (
          <Button
            variant="soft"
            size="icon"
            aria-label={`Открыть ${value}`}
            onClick={() => api.app.openExternal(value).catch((e: Error) => toast.error(e.message))}
          >
            <ExternalLink />
          </Button>
        )}
      </ButtonGroup>
    </Field>
  )
}

function Terms({ project, patch }: { project: ProjectSummary; patch: (p: ProjectPatch) => void }) {
  const info = BILLING_INFO[project.billing]
  const amount = project.billing === 'hourly' ? project.rate : project.fixedPrice
  const platforms = usePlatforms()
  const platform = platforms.find((x) => x.id === project.platformId)
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Платформа</SectionLabel>
      <PlatformSelect value={project.platformId} onChange={(platformId) => patch({ platformId })} />
      {project.platformId && project.billing !== 'none' && (
        <FeeField
          key={`fee-${project.platformId}`}
          saveOnBlur
          value={project.feePercent}
          platformDefault={platform?.defaultFeePercent}
          onChange={(feePercent) => patch({ feePercent })}
        />
      )}
      <SectionLabel>Условия оплаты</SectionLabel>
      <BillingPicker
        compact
        value={project.billing}
        onChange={(billing: BillingType) => patch({ billing, ...amountPatch(billing, amount) })}
      />
      <div className="grid grid-cols-2 gap-2">
        {info.amountLabel && (
          <Field label={info.amountLabel} key={`amount-${project.billing}`}>
            <Input
              inputMode="decimal"
              defaultValue={amount || ''}
              onBlur={(e) =>
                patch(
                  project.billing === 'hourly'
                    ? { rate: numberOrZero(e.target.value) }
                    : { fixedPrice: numberOrZero(e.target.value) }
                )
              }
            />
          </Field>
        )}
        {project.billing !== 'none' && (
          <Field label="Валюта">
            <Choice
              value={project.currency}
              onChange={(v) => v && patch({ currency: v })}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
        )}
        {project.billing === 'hourly' && (
          <Field label="Бюджет, ч">
            <Input
              inputMode="decimal"
              defaultValue={project.budgetHours || ''}
              placeholder="—"
              onBlur={(e) => patch({ budgetHours: numberOrZero(e.target.value) })}
            />
          </Field>
        )}
      </div>
      <Field label={project.billing === 'retainer' ? 'Абонемент с' : 'Начало'}>
        <DatePicker
          value={project.startAt}
          onChange={(startAt) => patch({ startAt })}
          placeholder="Не указано"
        />
      </Field>
      <Field label={project.billing === 'retainer' ? 'До' : 'Дедлайн'}>
        <DatePicker
          value={project.dueAt}
          onChange={(dueAt) => patch({ dueAt })}
          placeholder="Без срока"
        />
      </Field>
    </section>
  )
}

export function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('projects', 'details', id)
  const { data: clients = [] } = useApi('clients', 'list')
  const update = useApiMutation('projects', 'update')
  const remove = useApiMutation('projects', 'remove', {
    successMessage: 'Проект в корзине',
    onSuccess: () => navigate('/clients?tab=projects')
  })
  const p = data?.project
  const patch = (patchValue: ProjectPatch): void => update.mutate({ id, patch: patchValue })
  const [title, setTitle] = useAutosave(
    p?.title ?? '',
    (t) => t.trim() && patch({ title: t.trim() })
  )
  const [description, setDescription] = useAutosave(p?.description ?? '', (d) =>
    patch({ description: d })
  )

  if (isLoading) return null
  if (!data || !p) {
    return (
      <EmptyState
        title="Проект не найден"
        hint="Возможно, он в корзине."
        action={<Button onClick={() => navigate('/clients?tab=projects')}>К проектам</Button>}
      />
    )
  }

  const hourly = p.billing === 'hourly'
  const time = (
    <TimeSection
      projectId={p.id}
      entries={data.timeEntries}
      rate={p.rate}
      currency={p.currency}
      hourly={hourly}
      secondary={!hourly}
    />
  )

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10" key={p.id}>
        <Breadcrumb className="mb-4">
          <BreadcrumbList className="text-[12.5px]">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/clients?tab=projects" className="flex items-center gap-1">
                  <ArrowLeft className="size-3.5" /> Проекты
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {data.client && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/clients/${data.client.id}`}>{data.client.name}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-start gap-4">
          <InlineTitle value={title} onChange={setTitle} className="text-[40px]" />
          <div className="flex shrink-0 items-center gap-2 pt-2">
            <PinButtons entity={{ type: 'project', id }} />
            <Confirm
              title="Удалить проект?"
              description="Проект уйдёт в корзину на 30 дней вместе с часами и оплатами."
              onConfirm={() => remove.mutate(id)}
            >
              <Button variant="ghost" size="icon-sm" aria-label="В корзину">
                <Trash2 />
              </Button>
            </Confirm>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Choice
            className="w-40"
            value={p.status}
            onChange={(v) => v && patch({ status: v })}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))}
          />
          <Choice
            className="w-60"
            value={p.clientId}
            none="Без клиента"
            onChange={(v) => patch({ clientId: v })}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
          <PlatformBadge platformId={p.platformId} name={p.platformName} />
          <NetPaid project={p} />
        </div>

        <MoneyHeader p={p} />

        <div className="mt-8 flex flex-col gap-10">
          {hourly && time}
          {p.billing !== 'none' && (
            <PaymentsSection
              projectId={p.id}
              currency={p.currency}
              payments={data.payments}
              billing={p.billing}
              price={p.fixedPrice}
              paid={p.paidAmount}
            />
          )}
          {!hourly && time}
          <CredentialsSection items={data.credentials} owner={{ projectId: p.id }} />
          <Section title="Описание">
            <MarkdownField
              value={description}
              onChange={setDescription}
              placeholder="Задачи, договорённости, контакты на стороне клиента…"
            />
          </Section>
        </div>
      </div>

      <aside
        className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-6"
        key={`aside-${p.id}`}
      >
        <div className="flex flex-col gap-6">
          <Terms project={p} patch={patch} />
          <Separator />
          <section className="flex flex-col gap-3">
            <SectionLabel>Ссылки</SectionLabel>
            {LINK_FIELDS.map((f) => (
              <UrlField
                key={f.key}
                label={f.label}
                value={p[f.key]}
                placeholder={f.placeholder}
                onSave={(v) => patch({ [f.key]: v })}
              />
            ))}
          </section>
          <Separator />
          <EntityAside
            entity={{ type: 'project', id: p.id }}
            tags={p.tags}
            onTagsChange={(tagIds) => patch({ tagIds })}
            createdAt={p.createdAt}
            updatedAt={p.updatedAt}
          />
        </div>
      </aside>
    </div>
  )
}
