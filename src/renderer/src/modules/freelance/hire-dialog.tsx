import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Handshake } from 'lucide-react'
import { projectInputSchema } from '@shared/domain/crm'
import type { Platform, Proposal } from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { NumberInput } from '@/components/common/number-input'
import { draftToNumber, numberToDraft } from '../crm/money'
import { limitsOf, rangesOf } from '@/lib/limits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, Segmented } from '@/components/common/page'

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
  const [title, setTitle] = useState(proposal.jobTitle)
  const [billing, setBilling] = useState<'fixed' | 'hourly'>(proposal.bidType)
  const [amount, setAmount] = useState(String(proposal.bidAmount || ''))
  const [fee, setFee] = useState(String(proposal.feePercent ?? platform.defaultFeePercent))
  const hire = useApiMutation('proposals', 'hire', {
    successMessage: 'Контракт створено',
    onSuccess: ({ projectId }) => {
      onOpenChange(false)
      navigate(`/projects/${projectId}`)
    }
  })
  const amountNum = Number(amount.replace(',', '.'))
  const feeNum = Number(fee.replace(',', '.'))
  // An hourly rate has a lower ceiling than a project price: switching to «Погодинно» re-checks it.
  const amountMax = (billing === 'hourly' ? PROJECT_R.rate : PROJECT_R.fixedPrice)?.max ?? Infinity
  const amountOver = !Number.isNaN(amountNum) && amountNum > amountMax
  const valid =
    title.trim() &&
    !Number.isNaN(amountNum) &&
    amountNum >= 0 &&
    !amountOver &&
    !Number.isNaN(feeNum) &&
    feeNum >= 0 &&
    feeNum <= 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">Оформити контракт</DialogTitle>
          <DialogDescription>
            Клієнт і проєкт з’являться в «Клієнтах й контрактах»
            {proposal.clientName ? ` — ${proposal.clientName}` : ''}. Відгук перейде в статус
            «Контракт».
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid || hire.isPending) return
            hire.mutate({
              proposalId: proposal.id,
              clientId: proposal.clientId,
              title: title.trim(),
              billing,
              amount: amountNum,
              feePercent: feeNum
            })
          }}
        >
          <Field label="Назва контракту">
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
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={billing === 'hourly' ? 'Ставка за годину' : 'Вартість проєкту'}
              error={amountOver ? `Не більше ${amountMax.toLocaleString('uk-UA')} ${platform.currency}` : undefined}
            >
              <InputGroup>
                <NumberInput
                  data-slot="input-group-control"
                  className="flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                  allowEmpty
                  min={0}
                  max={amountMax}
                  aria-invalid={amountOver || undefined}
                  value={draftToNumber(amount)}
                  onChange={(v) => setAmount(numberToDraft(v))}
                />
                <InputGroupAddon align="inline-end">{platform.currency}</InputGroupAddon>
              </InputGroup>
            </Field>
            <Field label="Комісія платформи">
              <InputGroup>
                <NumberInput
                  data-slot="input-group-control"
                  className="flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                  allowEmpty
                  {...PROJECT_R.feePercent}
                  step={0.5}
                  value={draftToNumber(fee)}
                  onChange={(v) => setFee(numberToDraft(v))}
                />
                <InputGroupAddon align="inline-end">%</InputGroupAddon>
              </InputGroup>
            </Field>
          </div>
          {!Number.isNaN(amountNum) && amountNum > 0 && !Number.isNaN(feeNum) && (
            <p className="text-caption text-muted-foreground">
              На руки {billing === 'hourly' ? 'за годину' : 'за проєкт'}:{' '}
              <span className="font-medium text-foreground tabular-nums">
                {(amountNum * (1 - feeNum / 100)).toFixed(2)} {platform.currency}
              </span>
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="submit" variant="lime" disabled={!valid || hire.isPending}>
              <Handshake /> Створити контракт
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
