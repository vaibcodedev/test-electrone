import { useState } from 'react'
import { useNavigate } from 'react-router'
import { projectInputSchema } from '@shared/domain/crm'
import type { Platform, Proposal } from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtMoney } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Field, Segmented } from '@/components/common/page'
import { FormDialog } from '@/components/common/form-dialog'
import { NumberField, useInvalidFields } from '@/components/common/number-field'

const TITLE_MAX = limitsOf(projectInputSchema).title
const PROJECT_R = rangesOf(projectInputSchema)

/**
 * «Контракт»: turns a won proposal into a CRM client + contract (project) on this platform.
 * Fee % comes from the proposal (shown by Upwork at bidding) or the platform default.
 */
export function HireDialog({
  open,
  onOpenChange,
  proposal,
  platform
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  proposal: Proposal
  platform: Platform
}) {
  const navigate = useNavigate()
  const numbers = useInvalidFields()
  const [title, setTitle] = useState(proposal.jobTitle)
  const [billing, setBilling] = useState<'fixed' | 'hourly'>(proposal.bidType)
  const [amount, setAmount] = useState<number | null>(proposal.bidAmount || null)
  const [fee, setFee] = useState<number | null>(
    proposal.feePercent ?? platform.defaultFeePercent
  )
  const hire = useApiMutation('proposals', 'hire', {
    successMessage: 'Контракт створено',
    onSuccess: ({ projectId }) => {
      onOpenChange(false)
      navigate(`/projects/${projectId}`)
    }
  })
  // An hourly rate has a lower ceiling than a project price: switching to «Погодинно» re-checks it.
  const amountR = billing === 'hourly' ? PROJECT_R.rate : PROJECT_R.fixedPrice
  const amountNum = amount ?? 0
  const feeNum = fee ?? 0

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Оформити контракт"
      description={
        <>
          Клієнт і проєкт з’являться в «Клієнтах й контрактах»
          {proposal.clientName ? ` — ${proposal.clientName}` : ''}. Відгук перейде в статус
          «Контракт».
        </>
      }
      submitLabel="Створити контракт"
      className="sm:max-w-[460px]"
      invalid={!title.trim() || numbers.invalid}
      pending={hire.isPending}
      onSubmit={() =>
        hire.mutate({
          proposalId: proposal.id,
          clientId: proposal.clientId,
          title: title.trim(),
          billing,
          amount: amountNum,
          feePercent: feeNum
        })
      }
    >
      <Field label="Назва контракту" error={title.trim() ? undefined : 'Вкажіть назву контракту'}>
        <Input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Оплата">
        <Segmented
          className="w-fit"
          value={billing}
          onChange={setBilling}
          options={[
            { value: 'fixed', label: 'Фіксована ціна' },
            { value: 'hourly', label: 'Погодинно' }
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 items-start gap-4">
        <NumberField
          label={billing === 'hourly' ? 'Ставка за годину' : 'Вартість проєкту'}
          value={amount}
          min={0}
          max={amountR?.max}
          unit={platform.currency}
          onCommit={setAmount}
          onValidityChange={numbers.report('amount')}
        />
        <NumberField
          label="Комісія платформи"
          value={fee}
          {...PROJECT_R.feePercent}
          step={0.5}
          unit="%"
          onCommit={setFee}
          onValidityChange={numbers.report('fee')}
        />
      </div>
      {amountNum > 0 && (
        <p className="text-caption text-muted-foreground">
          На руки {billing === 'hourly' ? 'за годину' : 'за проєкт'}:{' '}
          <span className="font-medium text-foreground tabular-nums">
            {fmtMoney(amountNum * (1 - feeNum / 100), platform.currency)}
          </span>
        </p>
      )}
    </FormDialog>
  )
}
