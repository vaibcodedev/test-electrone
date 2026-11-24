import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  BILLING_TYPES,
  CURRENCIES,
  type BillingType,
  type Currency,
  type ClientInput,
  type ProjectInput
} from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { fromLocalInput } from '@/lib/format'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/page'
import { BILLING_LABEL } from './labels'
import { Choice, numberOrZero } from './parts'

function FormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  disabled,
  onSubmit,
  children
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  submitLabel: string
  disabled?: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (!disabled) onSubmit()
          }}
        >
          {children}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="lime" disabled={disabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const [form, setForm] = useState<ClientInput>({ name: '', company: '', email: '', currency: 'USD', defaultRate: 0 })
  const create = useApiMutation('clients', 'create', {
    successMessage: 'Клиент добавлен',
    onSuccess: (c) => {
      onOpenChange(false)
      setForm({ name: '', company: '', email: '', currency: 'USD', defaultRate: 0 })
      navigate(`/clients/${c.id}`)
    }
  })
  const set = (patch: Partial<ClientInput>): void => setForm((f) => ({ ...f, ...patch }))
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Новый клиент"
      submitLabel="Добавить клиента"
      disabled={!form.name.trim() || create.isPending}
      onSubmit={() => create.mutate(form)}
    >
      <Field label="Имя или название">
        <Input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Анна Петренко" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Компания">
          <Input value={form.company} onChange={(e) => set({ company: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Валюта">
          <Choice
            value={form.currency as Currency}
            onChange={(v) => v && set({ currency: v })}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Ставка в час по умолчанию">
          <Input
            inputMode="decimal"
            value={form.defaultRate || ''}
            onChange={(e) => set({ defaultRate: numberOrZero(e.target.value) })}
            placeholder="0"
          />
        </Field>
      </div>
    </FormDialog>
  )
}

export function ProjectDialog({
  open,
  onOpenChange,
  clientId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId?: string
}) {
  const navigate = useNavigate()
  const { data: clients = [] } = useApi('clients', 'list', undefined, { enabled: open })
  const initial = (): ProjectInput => {
    const c = clients.find((x) => x.id === clientId)
    return {
      title: '',
      clientId: clientId ?? null,
      billing: 'hourly',
      rate: c?.defaultRate ?? 0,
      fixedPrice: 0,
      currency: c?.currency ?? 'USD',
      budgetHours: 0,
      dueAt: null
    }
  }
  const [form, setForm] = useState<ProjectInput>(initial)
  const [due, setDue] = useState('')
  const create = useApiMutation('projects', 'create', {
    successMessage: 'Проект создан',
    onSuccess: (p) => {
      onOpenChange(false)
      navigate(`/projects/${p.id}`)
    }
  })
  const set = (patch: Partial<ProjectInput>): void => setForm((f) => ({ ...f, ...patch }))

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setForm(initial())
          setDue('')
        }
        onOpenChange(o)
      }}
      title="Новый проект"
      submitLabel="Создать проект"
      disabled={!form.title.trim() || create.isPending}
      onSubmit={() => create.mutate({ ...form, dueAt: fromLocalInput(due) })}
    >
      <Field label="Название">
        <Input autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Редизайн магазина" />
      </Field>
      <Field label="Клиент">
        <Choice
          value={form.clientId ?? null}
          none="Без клиента"
          onChange={(v) => {
            const c = clients.find((x) => x.id === v)
            set({ clientId: v, ...(c ? { currency: c.currency, rate: c.defaultRate } : {}) })
          }}
          options={clients.map((c) => ({ value: c.id, label: c.company ? `${c.name} — ${c.company}` : c.name }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Оплата">
          <Choice
            value={form.billing as BillingType}
            onChange={(v) => v && set({ billing: v })}
            options={BILLING_TYPES.map((b) => ({ value: b, label: BILLING_LABEL[b] }))}
          />
        </Field>
        <Field label="Валюта">
          <Choice
            value={form.currency as Currency}
            onChange={(v) => v && set({ currency: v })}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        {form.billing === 'fixed' ? (
          <Field label="Стоимость проекта">
            <Input
              inputMode="decimal"
              value={form.fixedPrice || ''}
              onChange={(e) => set({ fixedPrice: numberOrZero(e.target.value) })}
              placeholder="0"
            />
          </Field>
        ) : (
          <Field label={form.billing === 'retainer' ? 'Ставка (для учёта)' : 'Ставка в час'}>
            <Input
              inputMode="decimal"
              value={form.rate || ''}
              onChange={(e) => set({ rate: numberOrZero(e.target.value) })}
              placeholder="0"
            />
          </Field>
        )}
        <Field label="Бюджет, часов">
          <Input
            inputMode="decimal"
            value={form.budgetHours || ''}
            onChange={(e) => set({ budgetHours: numberOrZero(e.target.value) })}
            placeholder="без лимита"
          />
        </Field>
        <Field label="Дедлайн" className="col-span-2">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
    </FormDialog>
  )
}
