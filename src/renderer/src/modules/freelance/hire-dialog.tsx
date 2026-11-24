import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Handshake } from 'lucide-react'
import type { Platform, Proposal } from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Segmented } from '@/components/common/page'

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
    successMessage: 'Контракт создан',
    onSuccess: ({ projectId }) => {
      onOpenChange(false)
      navigate(`/projects/${projectId}`)
    }
  })
  const amountNum = Number(amount.replace(',', '.'))
  const feeNum = Number(fee.replace(',', '.'))
  const valid = title.trim() && !Number.isNaN(amountNum) && amountNum >= 0 && !Number.isNaN(feeNum) && feeNum >= 0 && feeNum <= 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Оформить контракт</DialogTitle>
          <DialogDescription>
            Клиент и проект появятся в «Клиентах и контрактах»{proposal.clientName ? ` — ${proposal.clientName}` : ''}. Отклик
            перейдёт в статус «Контракт».
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
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
          <Field label="Название контракта">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
          <Field label="Оплата">
            <Segmented
              value={billing}
              onChange={setBilling}
              options={[
                { value: 'fixed', label: 'Фикс за проект' },
                { value: 'hourly', label: 'Почасовая' }
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={billing === 'hourly' ? 'Ставка в час' : 'Стоимость проекта'}>
              <InputGroup>
                <InputGroupInput type="number" min={0} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <InputGroupAddon align="inline-end">{platform.currency}</InputGroupAddon>
              </InputGroup>
            </Field>
            <Field label="Комиссия платформы">
              <InputGroup>
                <InputGroupInput type="number" min={0} max={100} step={0.5} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
                <InputGroupAddon align="inline-end">%</InputGroupAddon>
              </InputGroup>
            </Field>
          </div>
          {!Number.isNaN(amountNum) && amountNum > 0 && !Number.isNaN(feeNum) && (
            <p className="text-caption text-muted-foreground">
              На руки {billing === 'hourly' ? 'за час' : 'за проект'}:{' '}
              <span className="font-medium text-foreground tabular-nums">
                {(amountNum * (1 - feeNum / 100)).toFixed(2)} {platform.currency}
              </span>
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="lime" disabled={!valid || hire.isPending}>
              <Handshake /> Создать контракт
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
