import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  CURRENCIES,
  type BillingType,
  type ClientInput,
  type Currency,
  type ProjectInput
} from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldGroup } from '@/components/ui/field'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { BILLING_INFO } from './labels'
import { BillingPicker, Choice } from './parts'
import { amountPatch, numberOrZero } from './money'

function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  disabled,
  onSubmit,
  children
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel: string
  disabled?: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (!disabled) onSubmit()
          }}
        >
          <FieldGroup className="gap-4">{children}</FieldGroup>
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

/** Amount input whose label follows the billing type; renders nothing for "none". */
export function AmountField({
  billing,
  value,
  onChange,
  currency,
  forClient
}: {
  billing: BillingType
  value: number
  onChange: (v: number) => void
  currency: Currency
  forClient?: boolean
}) {
  const label = BILLING_INFO[billing].amountLabel
  if (!label) return null
  return (
    <Field
      label={`${forClient && billing === 'fixed' ? 'Обычный бюджет проекта' : label}, ${currency}`}
    >
      <Input
        inputMode="decimal"
        value={value || ''}
        onChange={(e) => onChange(numberOrZero(e.target.value))}
        placeholder="0"
      />
    </Field>
  )
}

const EMPTY_CLIENT: ClientInput = {
  name: '',
  company: '',
  email: '',
  currency: 'USD',
  defaultBilling: 'fixed',
  defaultRate: 0
}

export function ClientDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState<ClientInput>(EMPTY_CLIENT)
  const create = useApiMutation('clients', 'create', {
    successMessage: 'Клиент добавлен',
    onSuccess: (c) => {
      onOpenChange(false)
      setForm(EMPTY_CLIENT)
      navigate(`/clients/${c.id}`)
    }
  })
  const set = (patch: Partial<ClientInput>): void => setForm((f) => ({ ...f, ...patch }))
  const billing = (form.defaultBilling ?? 'fixed') as BillingType
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
        <Input
          autoFocus
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Анна Петренко"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Компания">
          <Input
            value={form.company}
            onChange={(e) => set({ company: e.target.value })}
            placeholder="Bloom Store"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="name@company.com"
          />
        </Field>
      </div>
      <Field label="Как обычно работаете">
        <BillingPicker value={billing} onChange={(defaultBilling) => set({ defaultBilling })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Валюта">
          <Choice
            value={form.currency as Currency}
            onChange={(v) => v && set({ currency: v })}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <AmountField
          forClient
          billing={billing}
          value={form.defaultRate ?? 0}
          onChange={(defaultRate) => set({ defaultRate })}
          currency={(form.currency ?? 'USD') as Currency}
        />
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
  const fromClient = (id: string | null | undefined): Partial<ProjectInput> => {
    const c = clients.find((x) => x.id === id)
    if (!c) return {}
    return {
      currency: c.currency,
      billing: c.defaultBilling,
      ...amountPatch(c.defaultBilling, c.defaultRate)
    }
  }
  const initial = (): ProjectInput => ({
    title: '',
    clientId: clientId ?? null,
    billing: 'fixed',
    rate: 0,
    fixedPrice: 0,
    currency: 'USD',
    budgetHours: 0,
    startAt: null,
    dueAt: null,
    ...fromClient(clientId)
  })
  const [form, setForm] = useState<ProjectInput>(initial)
  const clientsLoaded = clients.length > 0
  useEffect(() => {
    if (!open) return
    setForm(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when opened / clients first arrive
  }, [open, clientsLoaded])
  const create = useApiMutation('projects', 'create', {
    successMessage: 'Проект создан',
    onSuccess: (p) => {
      onOpenChange(false)
      navigate(`/projects/${p.id}`)
    }
  })
  const set = (patch: Partial<ProjectInput>): void => setForm((f) => ({ ...f, ...patch }))
  const billing = (form.billing ?? 'fixed') as BillingType
  const currency = (form.currency ?? 'USD') as Currency

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Новый проект"
      description="Сначала выберите, как оплачивается работа — поля подстроятся."
      submitLabel="Создать проект"
      disabled={!form.title.trim() || create.isPending}
      onSubmit={() =>
        create.mutate({
          ...form,
          startAt:
            billing === 'retainer'
              ? (form.startAt ?? new Date().setHours(0, 0, 0, 0))
              : form.startAt
        })
      }
    >
      <Field label="Название">
        <Input
          autoFocus
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Редизайн магазина"
        />
      </Field>
      <Field label="Клиент">
        <Choice
          value={form.clientId ?? null}
          none="Без клиента"
          onChange={(v) => set({ clientId: v, ...fromClient(v) })}
          options={clients.map((c) => ({
            value: c.id,
            label: c.company ? `${c.name} — ${c.company}` : c.name
          }))}
        />
      </Field>
      <Field label="Оплата">
        <BillingPicker value={billing} onChange={(b) => set({ billing: b })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {billing !== 'none' && (
          <Field label="Валюта">
            <Choice
              value={currency}
              onChange={(v) => v && set({ currency: v })}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
        )}
        <AmountField
          billing={billing}
          currency={currency}
          value={billing === 'hourly' ? (form.rate ?? 0) : (form.fixedPrice ?? 0)}
          onChange={(v) => set(billing === 'hourly' ? { rate: v } : { fixedPrice: v })}
        />
        {billing === 'hourly' && (
          <Field label="Бюджет, часов">
            <Input
              inputMode="decimal"
              value={form.budgetHours || ''}
              onChange={(e) => set({ budgetHours: numberOrZero(e.target.value) })}
              placeholder="без лимита"
            />
          </Field>
        )}
        {billing === 'retainer' && (
          <Field label="Абонемент с">
            <DatePicker
              value={form.startAt ?? null}
              onChange={(startAt) => set({ startAt })}
              placeholder="Сегодня"
            />
          </Field>
        )}
        <Field label={billing === 'retainer' ? 'До (необязательно)' : 'Дедлайн'}>
          <DatePicker
            value={form.dueAt ?? null}
            onChange={(dueAt) => set({ dueAt })}
            placeholder="Без срока"
          />
        </Field>
      </div>
    </FormDialog>
  )
}
