import { useState, type ReactNode } from 'react'
import { normalizeUrl, openUrl } from '@/lib/open-url'
import { MoneyValue } from '@/components/common/money-value'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  CURRENCIES,
  PROJECT_STATUSES,
  projectInputSchema,
  type BillingType,
  type ProjectPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { NumberInput } from '@/components/common/number-input'
import { EditToggle, RecordMode, useReadOnly, useRecordMode } from '@/components/common/detail-mode'
import { ProjectTermsView } from './client-aside'
import { isLikelyUrl, limitsOf, rangesOf, URL_ERROR } from '@/lib/limits'
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
import { BILLING_INFO, DUE_BEFORE_START, PROJECT_STATUS_LABEL } from './labels'
import { BillingPicker, Choice, Meter } from './parts'
import { amountPatch } from './money'
import { TimeSection } from './time-section'
import { PaymentsSection } from './payments-section'
import { CredentialsSection } from './credentials-section'
import { FeeField, NetPaid, PlatformBadge, PlatformSelect, usePlatforms } from './platform-fields'

/** Stat cell: muted caption label → value (text-stat-sm, tabular, foreground) → optional caption. */
function Money({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-caption text-muted-foreground">{label}</span>
      {/* Wraps at spaces instead of «100 млн U…»: four columns get narrow on a small window. */}
      <span className="font-display text-stat-sm leading-tight tabular-nums [overflow-wrap:anywhere]">{value}</span>
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  )
}

/**
 * Money header in the language of the billing type: four equal stat cells with one type scale, no
 * highlighted values, and one full-width progress bar under the whole row (docs/design-system.md →
 * Списки и плитки). «Ставка» says «ще немає годин» instead of a bare dash.
 */
function MoneyHeader({ p, overdue }: { p: ProjectSummary; overdue: boolean }) {
  const m = (n: number): string => fmtMoney(n, p.currency)
  const rateCell = (
    <Money
      label="Фактична ставка"
      value={
        p.trackedMinutes > 0 && p.effectiveRate ? (
          <>
            <MoneyValue amount={p.effectiveRate} currency={p.currency} />
            /год
          </>
        ) : (
          <span className="font-sans text-body text-muted-foreground">ще немає годин</span>
        )
      }
      hint={p.trackedMinutes > 0 ? `за ${fmtHours(p.trackedMinutes)}` : undefined}
    />
  )
  const owed = (
    <Money
      label={p.billing === 'fixed' ? 'Залишилося отримати' : 'Очікується'}
      value={<MoneyValue amount={p.outstandingAmount} currency={p.currency} />}
      hint={overdue ? <span className="text-warn">є прострочені оплати</span> : undefined}
    />
  )
  let cells: ReactNode
  let bar: ReactNode = null
  switch (p.billing) {
    case 'hourly':
      cells = (
        <>
          <Money label="Зароблено" value={<MoneyValue amount={p.earnedAmount} currency={p.currency} />} hint={`${m(p.rate)}/год`} />
          <Money label="Оплачено" value={<MoneyValue amount={p.paidAmount} currency={p.currency} />} />
          {owed}
          <Money
            label="Години"
            value={fmtHours(p.trackedMinutes)}
            hint={p.budgetHours > 0 ? `з ${p.budgetHours} год бюджету` : undefined}
          />
        </>
      )
      if (p.budgetHours > 0) {
        const pct = Math.min(100, Math.round((p.trackedMinutes / 60 / p.budgetHours) * 100))
        bar = (
          <ProgressLine
            label={`Відпрацьовано ${fmtHours(p.trackedMinutes)} з ${p.budgetHours} год · ${pct}%`}
          >
            <Meter value={p.trackedMinutes / 60} max={p.budgetHours} />
          </ProgressLine>
        )
      }
      break
    case 'fixed':
      cells = (
        <>
          <Money label="Вартість проєкту" value={<MoneyValue amount={p.fixedPrice} currency={p.currency} />} />
          <Money label="Оплачено" value={<MoneyValue amount={p.paidAmount} currency={p.currency} />} />
          {owed}
          {rateCell}
        </>
      )
      if (p.fixedPrice > 0) {
        // Old data can be overpaid: the bar and percent stop at 100%, the excess is said in words.
        const pct = Math.min(100, Math.round((p.paidAmount / p.fixedPrice) * 100))
        const over = p.paidAmount - p.fixedPrice
        bar = (
          <ProgressLine
            label={`Оплачено ${m(p.paidAmount)} з ${m(p.fixedPrice)} · ${pct}%`}
            warn={over > 0 ? `переплата ${m(over)}` : undefined}
          >
            <Meter value={Math.min(p.paidAmount, p.fixedPrice)} max={p.fixedPrice} />
          </ProgressLine>
        )
      }
      break
    case 'retainer':
      cells = (
        <>
          <Money
            label="Ретейнер"
            value={`${m(p.fixedPrice)}/міс`}
            hint={`${p.retainerMonths} ${plural(p.retainerMonths, ['місяць', 'місяці', 'місяців'])}`}
          />
          <Money label="Оплачено" value={<MoneyValue amount={p.paidAmount} currency={p.currency} />} />
          {owed}
          {rateCell}
        </>
      )
      break
    default:
      cells = (
        <>
          <Money label="Години" value={fmtHours(p.trackedMinutes)} />
          <div className="col-span-3 self-center text-body text-muted-foreground">
            Проєкт без оплати — ведеться лише облік часу.
          </div>
        </>
      )
  }
  return (
    <Card className="mt-6 gap-5 p-6">
      <div className="grid grid-cols-4 gap-6">{cells}</div>
      {bar}
    </Card>
  )
}

function ProgressLine({
  label,
  warn,
  children
}: {
  label: string
  warn?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex justify-between gap-3 text-caption tabular-nums">
        <span className="text-muted-foreground">{label}</span>
        {warn && <span className="text-warn">{warn}</span>}
      </span>
      {children}
    </div>
  )
}

const PROJECT_L = limitsOf(projectInputSchema)
const PROJECT_R = rangesOf(projectInputSchema)
const URL_MAX = PROJECT_L.prodUrl

const LINK_FIELDS: {
  key: 'repoUrl' | 'stagingUrl' | 'prodUrl' | 'adminUrl'
  label: string
  placeholder: string
}[] = [
  { key: 'prodUrl', label: 'Прод', placeholder: 'https://store.com' },
  { key: 'stagingUrl', label: 'Стейджинг', placeholder: 'https://staging…' },
  { key: 'adminUrl', label: 'Адмінка', placeholder: 'https://admin.shopify.com/…' },
  { key: 'repoUrl', label: 'Репозиторій', placeholder: 'https://github.com/…' }
]

/**
 * Link field that saves on blur. A non-empty value that doesn't look like a link is not saved:
 * the error stays under the field until it's fixed (docs/design-system.md → Ограничения ввода).
 */
export function UrlField({
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
  const [bad, setBad] = useState(false)
  const readOnly = useReadOnly()
  // View mode: an empty link takes no space, a filled one is just a link to open.
  if (readOnly) {
    if (!value) return null
    return (
      <Field label={label}>
        <Button
          variant="link"
          className="w-fit max-w-full justify-start truncate"
          onClick={() => openUrl(value).catch((e: Error) => toast.error(e.message))}
        >
          <span className="truncate">{value.replace(/^https?:\/\//, '')}</span>
          <ExternalLink />
        </Button>
      </Field>
    )
  }
  return (
    <Field label={label} error={bad ? URL_ERROR : undefined}>
      <ButtonGroup className="w-full">
        <Input
          type="url"
          defaultValue={value}
          placeholder={placeholder}
          maxLength={URL_MAX}
          aria-invalid={bad || undefined}
          onChange={(e) => bad && setBad(!isLikelyUrl(e.target.value))}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (!isLikelyUrl(v)) return setBad(true)
            setBad(false)
            if (normalizeUrl(v) !== value) onSave(normalizeUrl(v))
          }}
        />
        {value && (
          <Button
            variant="soft"
            size="icon"
            aria-label={`Відкрити ${value}`}
            onClick={() => openUrl(value).catch((e: Error) => toast.error(e.message))}
          >
            <ExternalLink />
          </Button>
        )}
      </ButtonGroup>
    </Field>
  )
}

function Terms({ project, patch }: { project: ProjectSummary; patch: (p: ProjectPatch) => void }) {
  const readOnly = useReadOnly()
  if (readOnly)
    return (
      <section className="flex flex-col gap-3">
        <SectionLabel>Умови</SectionLabel>
        <ProjectTermsView project={project} />
      </section>
    )
  return <TermsEditor project={project} patch={patch} />
}

function TermsEditor({
  project,
  patch
}: {
  project: ProjectSummary
  patch: (p: ProjectPatch) => void
}) {
  const info = BILLING_INFO[project.billing]
  const amount = project.billing === 'hourly' ? project.rate : project.fixedPrice
  const platforms = usePlatforms()
  const platform = platforms.find((x) => x.id === project.platformId)
  const dueBeforeStart = !!project.startAt && !!project.dueAt && project.dueAt < project.startAt
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
      <SectionLabel>Умови оплати</SectionLabel>
      <BillingPicker
        compact
        value={project.billing}
        onChange={(billing: BillingType) => patch({ billing, ...amountPatch(billing, amount) })}
      />
      <div className="grid grid-cols-2 gap-2">
        {info.amountLabel && (
          <Field label={info.amountLabel} key={`amount-${project.billing}`}>
            <NumberInput
              value={amount || null}
              allowEmpty
              min={0}
              max={(project.billing === 'hourly' ? PROJECT_R.rate : PROJECT_R.fixedPrice)?.max}
              onChange={(v) =>
                patch(project.billing === 'hourly' ? { rate: v ?? 0 } : { fixedPrice: v ?? 0 })
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
          <Field label="Бюджет, год">
            <NumberInput
              value={project.budgetHours || null}
              allowEmpty
              {...PROJECT_R.budgetHours}
              step={0.5}
              placeholder="—"
              onChange={(v) => patch({ budgetHours: v ?? 0 })}
            />
          </Field>
        )}
      </div>
      <Field label={project.billing === 'retainer' ? 'Ретейнер з' : 'Початок'}>
        <DatePicker
          value={project.startAt}
          onChange={(startAt) => patch({ startAt })}
          placeholder="Не вказано"
        />
      </Field>
      <Field
        label={project.billing === 'retainer' ? 'До' : 'Дедлайн'}
        error={dueBeforeStart ? DUE_BEFORE_START : undefined}
      >
        <DatePicker
          value={project.dueAt}
          min={project.startAt}
          invalid={dueBeforeStart}
          onChange={(dueAt) => patch({ dueAt })}
          placeholder="Без терміну"
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
    successMessage: 'Проєкт переміщено в кошик',
    onSuccess: () => navigate('/clients?tab=projects')
  })
  const p = data?.project
  const patch = (patchValue: ProjectPatch): void => update.mutate({ id, patch: patchValue })
  // Click opens the project for reading; «Редагувати» switches the whole record to editing.
  const mode = useRecordMode(id, 'project')
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
        title="Проєкт не знайдено"
        hint="Можливо, він у кошику."
        action={<Button onClick={() => navigate('/clients?tab=projects')}>До проєктів</Button>}
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
    <RecordMode mode={mode}>
      <div className="flex h-full min-h-0">
        <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10" key={p.id}>
          <Breadcrumb className="mb-4">
            <BreadcrumbList className="text-caption">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/clients?tab=projects" className="flex items-center gap-1">
                    <ArrowLeft className="size-3.5" /> Проєкти
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
            <InlineTitle
              value={title}
              onChange={setTitle}
              maxLength={PROJECT_L.title}
              className="text-title"
            />
            <div className="flex shrink-0 items-center gap-2 pt-2">
              <EditToggle mode={mode} />
              <PinButtons entity={{ type: 'project', id }} />
              <Confirm
                title="Видалити проєкт?"
                description="Проєкт піде в кошик на 30 днів разом із годинами й оплатами."
                onConfirm={() => remove.mutate(id)}
              >
                <Button variant="ghost" size="icon-sm" aria-label="У кошик">
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
              none="Без клієнта"
              onChange={(v) => patch({ clientId: v })}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
            <PlatformBadge platformId={p.platformId} name={p.platformName} />
            <NetPaid project={p} />
          </div>

          <MoneyHeader p={p} overdue={data.payments.some((x) => x.overdue)} />

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
            <MarkdownField
              label="Опис"
              value={description}
              onChange={setDescription}
              placeholder="Завдання, домовленості, контакти з боку клієнта…"
              maxLength={PROJECT_L.description}
            />
          </div>
        </div>

        <aside
          className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-6"
          key={`aside-${p.id}`}
        >
          <div className="flex flex-col gap-6">
            <Terms project={p} patch={patch} />
            <Separator />
            {/* Reading with no links at all: no empty «Посилання» heading. */}
            {(mode.editing || LINK_FIELDS.some((f) => p[f.key])) && (
              <>
                <section className="flex flex-col gap-3">
                  <SectionLabel>Посилання</SectionLabel>
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
              </>
            )}
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
    </RecordMode>
  )
}
