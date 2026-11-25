import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import {
  clientInputSchema,
  CURRENCIES,
  projectInputSchema,
  type BillingType,
  type ClientInput,
  type ClientSummary,
  type Currency,
  type ProjectInput
} from '@shared/domain/crm'
import { EMAIL_ERROR, isLikelyEmail } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { NumberField, useInvalidFields } from '@/components/common/number-field'
import { BILLING_INFO, CURRENCY_SIGN, DUE_BEFORE_START } from './labels'
import { BillingPicker, Choice } from './parts'
import { amountPatch } from './money'
import { ClientCombobox } from './client-combobox'
import { ClientPlatformFields, FeeField, PlatformSelect, usePlatforms } from './platform-fields'

const CLIENT_L = limitsOf(clientInputSchema)
const CLIENT_R = rangesOf(clientInputSchema)
const PROJECT_L = limitsOf(projectInputSchema)
const PROJECT_R = rangesOf(projectInputSchema)
const REQUIRED = 'Обов’язкове поле'

const AMOUNT_PLACEHOLDER: Record<BillingType, string> = {
  fixed: '1500',
  hourly: '25',
  retainer: '800',
  none: ''
}

/** Amount whose label follows the billing type; renders nothing for "none". */
function AmountField({
  id,
  billing,
  value,
  onChange,
  currency,
  forClient,
  max,
  onValidityChange
}: {
  id: string
  billing: BillingType
  value: number
  onChange: (v: number) => void
  currency: Currency
  forClient?: boolean
  /** Max of the schema field this input edits (rate, fixedPrice, defaultRate). */
  max: number | undefined
  onValidityChange: (invalid: boolean) => void
}): ReactElement | null {
  const label = BILLING_INFO[billing].amountLabel
  if (!label) return null
  return (
    <NumberField
      key={billing}
      id={id}
      label={forClient && billing === 'fixed' ? 'Типовий бюджет проєкту' : label}
      value={value || null}
      min={0}
      max={max}
      unit={CURRENCY_SIGN[currency]}
      placeholder={AMOUNT_PLACEHOLDER[billing]}
      onCommit={(v) => onChange(v ?? 0)}
      onValidityChange={onValidityChange}
    />
  )
}

const EMPTY_CLIENT: ClientInput = {
  name: '',
  company: '',
  email: '',
  currency: 'USD',
  defaultBilling: 'fixed',
  defaultRate: 0,
  platformId: null,
  country: '',
  rating: null,
  totalSpent: null,
  hireRate: null,
  paymentVerified: null
}

export function ClientDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const navigate = useNavigate()
  const uid = useId()
  const [form, setForm] = useState<ClientInput>(EMPTY_CLIENT)
  const [emailBlurred, setEmailBlurred] = useState(false)
  const numbers = useInvalidFields()
  const create = useApiMutation('clients', 'create', {
    successMessage: 'Клієнта додано',
    onSuccess: (c) => {
      onOpenChange(false)
      setForm(EMPTY_CLIENT)
      setEmailBlurred(false)
      navigate(`/clients/${c.id}`)
    }
  })
  const set = (patch: Partial<ClientInput>): void => setForm((f) => ({ ...f, ...patch }))
  const billing = (form.defaultBilling ?? 'fixed') as BillingType
  const emailOk = isLikelyEmail(form.email ?? '')
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Новий клієнт"
      submitLabel="Додати клієнта"
      className="sm:max-w-[560px]"
      invalid={!form.name.trim() || !emailOk || numbers.invalid}
      pending={create.isPending}
      onSubmit={() => create.mutate({ ...form, email: (form.email ?? '').trim() })}
    >
      <Field
        label="Ім’я або назва"
        htmlFor={`${uid}-name`}
        hint={!form.name.trim() ? REQUIRED : undefined}
      >
        <Input
          id={`${uid}-name`}
          autoFocus
          value={form.name}
          maxLength={CLIENT_L.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Анна Петренко"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Компанія" htmlFor={`${uid}-company`}>
          <Input
            id={`${uid}-company`}
            value={form.company}
            maxLength={CLIENT_L.company}
            onChange={(e) => set({ company: e.target.value })}
            placeholder="Bloom Store"
          />
        </Field>
        <Field
          label="Email"
          htmlFor={`${uid}-email`}
          error={emailBlurred && !emailOk ? EMAIL_ERROR : undefined}
        >
          <Input
            id={`${uid}-email`}
            type="email"
            value={form.email}
            maxLength={CLIENT_L.email}
            aria-invalid={(emailBlurred && !emailOk) || undefined}
            onChange={(e) => set({ email: e.target.value })}
            onBlur={() => setEmailBlurred(true)}
            placeholder="name@company.com"
          />
        </Field>
      </div>
      <Field label="Платформа" htmlFor={`${uid}-platform`}>
        <PlatformSelect
          id={`${uid}-platform`}
          value={form.platformId}
          onChange={(platformId) => set({ platformId })}
        />
      </Field>
      {form.platformId && (
        <ClientPlatformFields
          currency={form.currency ?? 'USD'}
          value={{
            country: form.country ?? '',
            rating: form.rating ?? null,
            totalSpent: form.totalSpent ?? null,
            hireRate: form.hireRate ?? null,
            paymentVerified: form.paymentVerified ?? null
          }}
          onChange={(patch) => set(patch)}
          onInvalidChange={numbers.report}
        />
      )}
      <Field label="Типова оплата">
        <BillingPicker value={billing} onChange={(defaultBilling) => set({ defaultBilling })} />
      </Field>
      <div className="grid grid-cols-2 items-start gap-3">
        <Field label="Валюта" htmlFor={`${uid}-currency`}>
          <Choice
            id={`${uid}-currency`}
            value={form.currency as Currency}
            onChange={(v) => v && set({ currency: v })}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <AmountField
          id={`${uid}-amount`}
          forClient
          billing={billing}
          value={form.defaultRate ?? 0}
          max={CLIENT_R.defaultRate?.max}
          onChange={(defaultRate) => set({ defaultRate })}
          currency={(form.currency ?? 'USD') as Currency}
          onValidityChange={numbers.report('defaultRate')}
        />
      </div>
    </FormDialog>
  )
}

const emptyProject = (clientId: string | null): ProjectInput => ({
  title: '',
  clientId,
  billing: 'fixed',
  rate: 0,
  fixedPrice: 0,
  currency: 'USD',
  budgetHours: 0,
  startAt: null,
  dueAt: null,
  platformId: null,
  feePercent: null
})

/**
 * The chosen client's usual terms, applied only to the fields the person hasn't changed yet: picking a client
 * after typing a price keeps the price. The amount (rate / fixed price) counts as one field.
 */
function withClientDefaults(
  form: ProjectInput,
  c: ClientSummary,
  touched: ReadonlySet<keyof ProjectInput>
): ProjectInput {
  const next = { ...form }
  if (!touched.has('billing')) next.billing = c.defaultBilling
  if (!touched.has('currency')) next.currency = c.currency
  if (!touched.has('platformId')) next.platformId = c.platformId
  if (!touched.has('rate') && !touched.has('fixedPrice'))
    Object.assign(next, amountPatch(c.defaultBilling, c.defaultRate))
  return next
}

export function ProjectDialog({
  open,
  onOpenChange,
  clientId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId?: string
}): ReactElement {
  const navigate = useNavigate()
  const uid = useId()
  const [form, setForm] = useState<ProjectInput>(() => emptyProject(clientId ?? null))
  const touched = useRef(new Set<keyof ProjectInput>())
  const wasOpen = useRef(false)
  // The client the dialog was opened for (client page): its terms arrive after the dialog opens.
  const { data: ownerClient } = useApi('clients', 'get', clientId ?? '', {
    enabled: open && !!clientId
  })
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    // Reset only when the dialog opens, not when data arrives: typed values stay.
    if (!wasOpen.current) {
      wasOpen.current = true
      touched.current = new Set()
      setForm(emptyProject(clientId ?? null))
    }
    if (ownerClient && ownerClient.id === clientId)
      setForm((f) => (f.clientId === ownerClient.id ? withClientDefaults(f, ownerClient, touched.current) : f))
  }, [open, ownerClient, clientId])
  const create = useApiMutation('projects', 'create', {
    successMessage: 'Проєкт створено',
    onSuccess: (p) => {
      onOpenChange(false)
      navigate(`/projects/${p.id}`)
    }
  })
  const set = (patch: Partial<ProjectInput>): void => {
    for (const k of Object.keys(patch)) touched.current.add(k as keyof ProjectInput)
    setForm((f) => ({ ...f, ...patch }))
  }
  const pickClient = (c: ClientSummary | null): void => {
    touched.current.add('clientId')
    setForm((f) => {
      const next = { ...f, clientId: c?.id ?? null }
      return c ? withClientDefaults(next, c, touched.current) : next
    })
  }
  const billing = (form.billing ?? 'fixed') as BillingType
  const currency = (form.currency ?? 'USD') as Currency
  const platforms = usePlatforms()
  const platform = platforms.find((x) => x.id === form.platformId)
  const numbers = useInvalidFields()
  // A retainer without a start date starts today (see onSubmit).
  const startAt = form.startAt ?? (billing === 'retainer' ? new Date().setHours(0, 0, 0, 0) : null)
  const dueBeforeStart = !!startAt && !!form.dueAt && form.dueAt < startAt

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Новий проєкт"
      submitLabel="Створити проєкт"
      className="sm:max-w-[560px]"
      invalid={!form.title.trim() || dueBeforeStart || numbers.invalid}
      pending={create.isPending}
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
      <Field
        label="Назва"
        htmlFor={`${uid}-title`}
        hint={!form.title.trim() ? REQUIRED : undefined}
      >
        <Input
          id={`${uid}-title`}
          autoFocus
          value={form.title}
          maxLength={PROJECT_L.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Редизайн магазину"
        />
      </Field>
      <Field label="Клієнт" htmlFor={`${uid}-client`}>
        <ClientCombobox
          id={`${uid}-client`}
          value={form.clientId ?? null}
          currentName={ownerClient && ownerClient.id === form.clientId ? ownerClient.name : undefined}
          onChange={pickClient}
        />
      </Field>
      <div className="grid grid-cols-2 items-start gap-3">
        <Field label="Платформа" htmlFor={`${uid}-platform`}>
          <PlatformSelect
            id={`${uid}-platform`}
            value={form.platformId}
            onChange={(platformId) =>
              set({ platformId, feePercent: platformId ? form.feePercent : null })
            }
          />
        </Field>
        {form.platformId && billing !== 'none' && (
          <FeeField
            value={form.feePercent}
            platformDefault={platform?.defaultFeePercent}
            onChange={(feePercent) => set({ feePercent })}
            onInvalidChange={numbers.report('feePercent')}
          />
        )}
      </div>
      <Field label="Оплата">
        <BillingPicker value={billing} onChange={(b) => set({ billing: b })} />
      </Field>
      <div className="grid grid-cols-2 items-start gap-3">
        {billing !== 'none' && (
          <Field label="Валюта" htmlFor={`${uid}-currency`}>
            <Choice
              id={`${uid}-currency`}
              value={currency}
              onChange={(v) => v && set({ currency: v })}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
        )}
        <AmountField
          id={`${uid}-amount`}
          billing={billing}
          currency={currency}
          value={billing === 'hourly' ? (form.rate ?? 0) : (form.fixedPrice ?? 0)}
          max={(billing === 'hourly' ? PROJECT_R.rate : PROJECT_R.fixedPrice)?.max}
          onChange={(v) => set(billing === 'hourly' ? { rate: v } : { fixedPrice: v })}
          onValidityChange={numbers.report('amount')}
        />
        {billing === 'hourly' && (
          <NumberField
            id={`${uid}-budget`}
            label="Бюджет"
            unit="год"
            value={form.budgetHours || null}
            {...PROJECT_R.budgetHours}
            step={0.5}
            placeholder="без ліміту"
            onCommit={(v) => set({ budgetHours: v ?? 0 })}
            onValidityChange={numbers.report('budgetHours')}
          />
        )}
        {billing === 'retainer' && (
          <Field label="Ретейнер з">
            <DatePicker
              value={form.startAt ?? null}
              onChange={(startAt) => set({ startAt })}
              placeholder="Сьогодні"
            />
          </Field>
        )}
        <Field
          label={billing === 'retainer' ? 'До (необов’язково)' : 'Дедлайн'}
          error={dueBeforeStart ? DUE_BEFORE_START : undefined}
        >
          <DatePicker
            value={form.dueAt ?? null}
            min={startAt}
            invalid={dueBeforeStart}
            onChange={(dueAt) => set({ dueAt })}
            placeholder="Без терміну"
          />
        </Field>
      </div>
    </FormDialog>
  )
}
