import type { ReactElement } from 'react'
import { BadgeCheck } from 'lucide-react'
import {
  proposalInputSchema,
  type Platform,
  type Proposal,
  type ProposalPatch
} from '@shared/domain/freelance'
import { limitsOf, rangesOf } from '@/lib/limits'
import { NumberField } from '@/components/common/number-field'
import { TextField } from '@/components/common/text-field'
import { Field } from '@/components/common/page'
import { SectionLabel } from '@/components/common/master-detail'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { CountryCombobox } from '../crm/country-combobox'

const PROPOSAL_L = limitsOf(proposalInputSchema)
const R = rangesOf(proposalInputSchema)

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
        {/* CountryCombobox shows «—» for an empty value while reading, so the field is left out here. */}
        {!(readOnly && !p.clientCountry) && (
          <Field label="Країна">
            <CountryCombobox
              value={p.clientCountry}
              onChange={(clientCountry) => patch({ clientCountry })}
            />
          </Field>
        )}
        <NumberField
          label="Рейтинг"
          value={p.clientRating}
          {...R.clientRating}
          step={0.1}
          onCommit={(clientRating) => patch({ clientRating })}
          placeholder="напр. 4,9"
          unit="★"
        />
        <NumberField
          label="Витрачено"
          value={p.clientSpent}
          {...R.clientSpent}
          onCommit={(clientSpent) => patch({ clientSpent })}
          unit={platform.currency}
        />
        <NumberField
          label="Найм, %"
          value={p.clientHireRate}
          {...R.clientHireRate}
          onCommit={(clientHireRate) => patch({ clientHireRate })}
          unit="%"
        />
        <TextField
          label="Відгуків на вакансію"
          maxLength={PROPOSAL_L.proposalsOnJob}
          value={p.proposalsOnJob}
          onSave={(proposalsOnJob) => patch({ proposalsOnJob })}
          placeholder="Наприклад, 20–50"
        />
      </div>
      {/* While reading only the positive fact is shown: a locked «off» switch read as a warning. */}
      {readOnly ? (
        p.paymentVerified && (
          <span className="flex items-center gap-1.5 text-body">
            <BadgeCheck className="size-4 text-success" aria-hidden />
            Оплату верифіковано
          </span>
        )
      ) : (
        <div className="flex items-center gap-2.5">
          <Switch
            id={`verified-${p.id}`}
            checked={!!p.paymentVerified}
            onCheckedChange={(paymentVerified) => patch({ paymentVerified })}
          />
          <Label htmlFor={`verified-${p.id}`} className="text-body font-normal text-foreground">
            Оплату верифіковано
          </Label>
          {p.paymentVerified && <BadgeCheck className="size-4 text-success" />}
        </div>
      )}
    </section>
  )
}
