import { useId, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { Plus, Unlink, Wallet } from 'lucide-react'
import type { Credential, CredentialPayment as Payment } from '@shared/domain/credentials'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDayFull, fmtMoney } from '@/lib/format'
import { Choice } from '@/components/common/choice'
import { Confirm } from '@/components/common/confirm'
import { FormDialog } from '@/components/common/form-dialog'
import { IconAction } from '@/components/common/icon-action'
import { Field } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SubscriptionDialog } from '@/modules/finance/subscription-dialog'
import { currentMonth } from '@/modules/finance/month'

const monthOf = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** «Платить клієнт · 12 $ / міс · 3 грудня», or «12 $ / міс · наступна оплата 3 грудня» when it is mine. */
function paymentText(p: Payment): string {
  const money = `${fmtMoney(p.amount, p.currency)} / ${p.period === 'yearly' ? 'рік' : 'міс'}`
  const next = p.nextAt
    ? p.ownExpense
      ? `наступна оплата ${fmtDayFull(p.nextAt)}`
      : fmtDayFull(p.nextAt)
    : 'підписку вимкнено'
  return [p.ownExpense ? null : 'Платить клієнт', money, next].filter(Boolean).join(' · ')
}

/** «Вибрати наявну»: links a subscription that is already in Finance. */
function LinkSubscriptionDialog({
  item,
  open,
  onOpenChange
}: {
  item: Credential
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const id = useId()
  const { data: subs = [] } = useApi('finance', 'subscriptions', undefined, { enabled: open })
  const [picked, setPicked] = useState<string>('')
  const link = useApiMutation('credentials', 'setPayment', { successMessage: 'Оплату прив’язано' })
  const options = subs.map((s) => ({
    value: s.id,
    label: `${s.title} · ${fmtMoney(s.amount, s.currency)}${s.credential ? ` (доступ «${s.credential.label}»)` : ''}`
  }))
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Оплата доступу"
      description="Підписка з «Фінанси › Підписки», яка оплачує цей доступ. Вона залишиться у Фінансах, а тут з’явиться сума й дата наступної оплати."
      submitLabel="Прив’язати"
      invalid={!picked}
      invalidReason="Оберіть підписку"
      pending={link.isPending}
      onSubmit={async () => {
        await link.mutateAsync({ id: item.id, subscriptionId: picked })
        onOpenChange(false)
      }}
    >
      {subs.length ? (
        <Field label="Підписка" htmlFor={`${id}-sub`}>
          <Choice
            id={`${id}-sub`}
            value={picked}
            onChange={(v) => setPicked(v ?? '')}
            options={options}
          />
        </Field>
      ) : (
        <p className="text-body text-muted-foreground">
          У «Фінансах» ще немає підписок — створіть нову з цього доступу.
        </p>
      )}
    </FormDialog>
  )
}

/**
 * The payment of an access: the line with the sum and the next date (a link to Фінанси › Підписки), or — while
 * editing — «+ Оплата»: a new subscription made from the access (name and link from it) or one that exists. The
 * subscription is the only record of the money: totals and the calendar count it once.
 */
export function CredentialPayment({ item }: { item: Credential }): ReactElement {
  const [dialog, setDialog] = useState<'new' | 'link' | null>(null)
  // A fresh form on every opening (the access may have been renamed since).
  const [seq, setSeq] = useState(0)
  const openDialog = (d: 'new' | 'link'): void => {
    setSeq((n) => n + 1)
    setDialog(d)
  }
  const unlink = useApiMutation('credentials', 'setPayment', {
    successMessage: 'Оплату відв’язано — підписка залишилась у Фінансах'
  })
  const link = useApiMutation('credentials', 'setPayment', { successMessage: 'Оплату додано' })
  const p = item.payment
  if (p)
    return (
      <div className="flex min-w-0 items-center gap-2" data-credential-payment>
        <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Button variant="link" className="min-w-0 truncate text-caption" asChild>
          <Link
            to={p.nextAt ? `/finance/expenses?month=${monthOf(p.nextAt)}` : '/finance/expenses'}
            title={p.title}
          >
            {paymentText(p)}
          </Link>
        </Button>
        <span data-edit-only className="flex shrink-0 items-center">
          <Confirm
            title="Відв’язати оплату?"
            description={`Підписка «${p.title}» залишиться у «Фінанси › Підписки» й далі рахуватиметься там.`}
            confirmLabel="Відв’язати"
            onConfirm={() => unlink.mutate({ id: item.id, subscriptionId: null })}
          >
            <IconAction label="Відв’язати оплату">
              <Unlink />
            </IconAction>
          </Confirm>
        </span>
      </div>
    )
  return (
    <div data-edit-only className="flex">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="soft" size="xs">
            <Plus /> Оплата
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => openDialog('new')}>Нова підписка…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog('link')}>Вибрати наявну…</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <SubscriptionDialog
        key={`new-${seq}`}
        open={dialog === 'new'}
        onOpenChange={(o) => !o && setDialog(null)}
        month={currentMonth()}
        prefill={{ title: item.label, url: item.url }}
        payerChoice
        onSaved={(sub) => link.mutateAsync({ id: item.id, subscriptionId: sub.id })}
      />
      <LinkSubscriptionDialog
        key={`link-${seq}`}
        item={item}
        open={dialog === 'link'}
        onOpenChange={(o) => !o && setDialog(null)}
      />
    </div>
  )
}
