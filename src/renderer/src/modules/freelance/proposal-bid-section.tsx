import type { ReactElement } from 'react'
import {
  BID_TYPES,
  proposalInputSchema,
  type Platform,
  type Proposal,
  type ProposalPatch
} from '@shared/domain/freelance'
import { rangesOf } from '@/lib/limits'
import { NumberField } from '@/components/common/number-field'
import { Field, Segmented } from '@/components/common/page'
import { SectionLabel } from '@/components/common/master-detail'
import { BID_TYPE_LABEL } from './proposal-labels'

const R = rangesOf(proposalInputSchema)

/**
 * «Ставка»: bid type, amount, fee and paid credits. Unfilled amounts are stored as 0 but shown as
 * empty fields, so view mode hides them instead of reading «0 USD».
 */
export function ProposalBidSection({
  proposal: p,
  platform,
  patch
}: {
  proposal: Proposal
  platform: Platform
  patch: (p: ProposalPatch) => void
}): ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Ставка</SectionLabel>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Тип ставки">
          <Segmented
            className="w-fit"
            value={p.bidType}
            onChange={(bidType) => patch({ bidType })}
            options={BID_TYPES.map((t) => ({ value: t, label: BID_TYPE_LABEL[t] }))}
          />
        </Field>
        <NumberField
          label={p.bidType === 'hourly' ? 'Ставка за годину' : 'Сума'}
          value={p.bidAmount || null}
          {...R.bidAmount}
          onCommit={(v) => patch({ bidAmount: v ?? 0 })}
          unit={platform.currency}
        />
        <NumberField
          label="Комісія платформи"
          value={p.feePercent}
          {...R.feePercent}
          step={0.5}
          onCommit={(feePercent) => patch({ feePercent })}
          hint={`За замовчуванням ${platform.defaultFeePercent}% — з налаштувань платформи`}
          unit="%"
        />
        {platform.creditsName && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={platform.creditsName}
              integer
              value={p.credits || null}
              {...R.credits}
              onCommit={(v) => patch({ credits: v ?? 0 })}
            />
            <NumberField
              label="Буст"
              integer
              value={p.boostCredits || null}
              {...R.boostCredits}
              onCommit={(v) => patch({ boostCredits: v ?? 0 })}
            />
          </div>
        )}
      </div>
      {platform.kind === 'upwork' && (
        <p data-edit-only className="text-caption text-muted-foreground">
          Точну комісію Upwork видно під час відгуку — запишіть її сюди, вона перейде в контракт.
        </p>
      )}
    </section>
  )
}
