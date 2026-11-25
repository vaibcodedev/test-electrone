import type { ReactElement } from 'react'
import { BadgeCheck } from 'lucide-react'
import {
  PROPOSAL_COUNT_LABEL,
  PROPOSAL_COUNTS,
  proposalCountOf,
  proposalInputSchema,
  type Platform,
  type Proposal,
  type ProposalCount,
  type ProposalPatch
} from '@shared/domain/freelance'
import { limitsOf, rangesOf } from '@/lib/limits'
import { NumberField } from '@/components/common/number-field'
import { TextField } from '@/components/common/text-field'
import { Field } from '@/components/common/page'
import { Choice, type ChoiceOption } from '@/components/common/choice'
import { SectionLabel } from '@/components/common/master-detail'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VERIFIED_HINT } from './g2-labels'
import { CountryCombobox } from '../crm/country-combobox'

const PROPOSAL_L = limitsOf(proposalInputSchema)
const R = rangesOf(proposalInputSchema)

/**
 * «Відгуків на вакансію»: one of Upwork's buckets. A free text typed before the choice existed stays the value — an
 * option of its own that can't be picked again — until another bucket replaces it, so nothing is lost.
 */
function ProposalCountField({
  id,
  value,
  onChange
}: {
  id: string
  value: string
  onChange: (value: ProposalCount | '') => void
}): ReactElement {
  const readOnly = useReadOnly()
  const bucket = proposalCountOf(value)
  const legacy = value && !bucket ? value : null
  const options: ChoiceOption<string>[] = PROPOSAL_COUNTS.map((c) => ({
    value: c,
    label: PROPOSAL_COUNT_LABEL[c]
  }))
  if (legacy) options.push({ value: legacy, label: legacy, disabled: true })
  return (
    <Field
      label="Відгуків на вакансію"
      htmlFor={id}
      hint={
        legacy && !readOnly
          ? 'Записано вручну до появи списку — виберіть варіант, щоб замінити'
          : undefined
      }
    >
      <Choice
        id={id}
        value={bucket ?? legacy}
        options={options}
        none="Не вказано"
        placeholder="Як на сторінці вакансії"
        onChange={(v) => onChange((v ?? '') as ProposalCount | '')}
      />
    </Field>
  )
}

/** «Клієнт»: who posted the job and the signals the platform shows about them. */

export function ProposalClientSection({
  proposal: p,
  platform,
  patch
}: {
  proposal: Proposal
  platform: Platform
  patch: (p: ProposalPatch) => void
}): ReactElement {
  const readOnly = useReadOnly()
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Клієнт</SectionLabel>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Ім’я або компанія"
          maxLength={PROPOSAL_L.clientName}
          value={p.clientName}
          onSave={(clientName) => patch({ clientName })}
        />
        <Field label="Країна" htmlFor={`country-${p.id}`}>
          <CountryCombobox
            id={`country-${p.id}`}
            value={p.clientCountry}
            onChange={(clientCountry) => patch({ clientCountry })}
          />
        </Field>
        <NumberField
          label="Рейтинг"
          // An old 0 means «no rating yet»: shown empty, not as an error.
          value={p.clientRating || null}
          {...R.clientRating}
          onCommit={(clientRating) => patch({ clientRating })}
          placeholder="Напр.: 4,9"
          unit="★"
        />
        <NumberField
          label="Витрачено"
          value={p.clientSpent}
          {...R.clientSpent}
          onCommit={(clientSpent) => patch({ clientSpent })}
          placeholder="Напр.: 25 000"
          unit={platform.currency}
        />
        <NumberField
          label="Найм"
          value={p.clientHireRate}
          {...R.clientHireRate}
          onCommit={(clientHireRate) => patch({ clientHireRate })}
          placeholder="Напр.: 70"
          unit="%"
        />
        <ProposalCountField
          id={`proposals-on-job-${p.id}`}
          value={p.proposalsOnJob}
          onChange={(proposalsOnJob) => patch({ proposalsOnJob })}
        />
      </div>
      {/* While reading only the positive fact is shown: a locked «off» switch read as a warning. */}
      {readOnly ? (
        p.paymentVerified && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="flex w-fit cursor-help items-center gap-1.5 text-body">
                <BadgeCheck className="size-4 text-success" aria-hidden />
                Оплату верифіковано
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{VERIFIED_HINT}</TooltipContent>
          </Tooltip>
        )
      ) : (
        <div className="flex items-center gap-2.5">
          <Switch
            id={`verified-${p.id}`}
            checked={!!p.paymentVerified}
            onCheckedChange={(paymentVerified) => patch({ paymentVerified })}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Label
                htmlFor={`verified-${p.id}`}
                className="cursor-help text-body font-normal text-foreground"
              >
                Оплату верифіковано
                {p.paymentVerified && <BadgeCheck className="size-4 text-success" aria-hidden />}
              </Label>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{VERIFIED_HINT}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </section>
  )
}
