import { useId, type ReactElement } from 'react'
import {
  CURRENCIES,
  projectInputSchema,
  type BillingType,
  type ProjectPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtDay, fmtHours, fmtPercent } from '@/lib/format'
import { useReadOnly } from '@/components/common/detail-mode'
import { SectionLabel } from '@/components/common/master-detail'
import { NumberField } from '@/components/common/number-field'
import { LinkInput } from '@/components/common/text-field'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { Separator } from '@/components/ui/separator'
import { BILLING_AMOUNT_LABEL, BILLING_LABEL, CURRENCY_SIGN, DUE_BEFORE_START } from './labels'
import { BillingPicker, Choice, InfoList, InfoRow } from './parts'
import { amountPatch } from './money'
import { FeeField, PlatformSelect } from './platform-fields'
import { usePlatforms } from './use-platforms'

const PROJECT_L = limitsOf(projectInputSchema)
const PROJECT_R = rangesOf(projectInputSchema)

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

/** Project links + a separator; in view mode only the filled ones, and nothing at all when none are. */
export function ProjectLinks({
  project,
  patch
}: {
  project: ProjectSummary
  patch: (p: ProjectPatch) => void
}): ReactElement | null {
  const readOnly = useReadOnly()
  const fields = LINK_FIELDS.filter((f) => !readOnly || project[f.key])
  if (!fields.length) return null
  return (
    <>
      <section className="flex flex-col gap-3">
        <SectionLabel>Посилання</SectionLabel>
        {fields.map((f) => (
          <LinkInput
            key={f.key}
            label={f.label}
            value={project[f.key]}
            placeholder={f.placeholder}
            maxLength={PROJECT_L[f.key]}
            openLabel={`Відкрити: ${f.label}`}
            onSave={(v) => patch({ [f.key]: v })}
          />
        ))}
      </section>
      <Separator />
    </>
  )
}

/** Project terms as text (view mode of the aside); price and platform are in the header. */
function ProjectTermsView({ project: p }: { project: ProjectSummary }): ReactElement {
  return (
    <InfoList>
      {p.platformId && p.billing !== 'none' && (
        <InfoRow label="Комісія">{fmtPercent(p.effectiveFeePercent)}</InfoRow>
      )}
      <InfoRow label="Оплата">{BILLING_LABEL[p.billing]}</InfoRow>
      {p.billing === 'hourly' && p.budgetHours > 0 && (
        <InfoRow label="Бюджет">{fmtHours(p.budgetHours * 60)}</InfoRow>
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

export function Terms({
  project,
  patch
}: {
  project: ProjectSummary
  patch: (p: ProjectPatch) => void
}): ReactElement {
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
}): ReactElement {
  const uid = useId()
  const amountLabel = BILLING_AMOUNT_LABEL[project.billing]
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
          value={project.feePercent}
          platformDefault={platform?.defaultFeePercent}
          platformName={platform?.name}
          onChange={(feePercent) => patch({ feePercent })}
        />
      )}
      <SectionLabel>Умови оплати</SectionLabel>
      <BillingPicker
        value={project.billing}
        onChange={(billing: BillingType) => patch({ billing, ...amountPatch(billing, amount) })}
      />
      <div className="grid grid-cols-2 items-start gap-2">
        {amountLabel && (
          <NumberField
            key={`amount-${project.billing}`}
            id={`${uid}-amount`}
            label={amountLabel}
            value={amount || null}
            min={0}
            max={(project.billing === 'hourly' ? PROJECT_R.rate : PROJECT_R.fixedPrice)?.max}
            unit={CURRENCY_SIGN[project.currency]}
            onCommit={(v) =>
              patch(project.billing === 'hourly' ? { rate: v ?? 0 } : { fixedPrice: v ?? 0 })
            }
          />
        )}
        {project.billing !== 'none' && (
          <Field label="Валюта" htmlFor={`${uid}-currency`}>
            <Choice
              id={`${uid}-currency`}
              value={project.currency}
              onChange={(v) => v && patch({ currency: v })}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
        )}
        {project.billing === 'hourly' && (
          <NumberField
            id={`${uid}-budget`}
            label="Бюджет"
            unit="год"
            value={project.budgetHours || null}
            {...PROJECT_R.budgetHours}
            step={0.5}
            placeholder="без ліміту"
            onCommit={(v) => patch({ budgetHours: v ?? 0 })}
          />
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
