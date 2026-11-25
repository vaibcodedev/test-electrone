import { useId, type ReactElement } from 'react'
import {
  CURRENCIES,
  projectInputSchema,
  type BillingType,
  type ProjectPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useReadOnly } from '@/components/common/detail-mode'
import { SectionLabel } from '@/components/common/master-detail'
import { NumberInput } from '@/components/common/number-input'
import { LinkInput } from '@/components/common/text-field'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { Separator } from '@/components/ui/separator'
import { BILLING_INFO, DUE_BEFORE_START } from './labels'
import { BillingPicker, Choice } from './parts'
import { amountPatch } from './money'
import { ProjectTermsView } from './client-aside'
import { FeeField, PlatformSelect, usePlatforms } from './platform-fields'

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
          value={project.feePercent}
          platformDefault={platform?.defaultFeePercent}
          onChange={(feePercent) => patch({ feePercent })}
        />
      )}
      <SectionLabel>Умови оплати</SectionLabel>
      <BillingPicker
        value={project.billing}
        onChange={(billing: BillingType) => patch({ billing, ...amountPatch(billing, amount) })}
      />
      <div className="grid grid-cols-2 gap-2">
        {info.amountLabel && (
          <Field
            label={info.amountLabel}
            htmlFor={`${uid}-amount`}
            key={`amount-${project.billing}`}
          >
            <NumberInput
              id={`${uid}-amount`}
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
          <Field label="Бюджет, год" htmlFor={`${uid}-budget`}>
            <NumberInput
              id={`${uid}-budget`}
              value={project.budgetHours || null}
              allowEmpty
              {...PROJECT_R.budgetHours}
              step={0.5}
              placeholder="без ліміту"
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
