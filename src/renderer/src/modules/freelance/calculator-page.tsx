import { useEffect, useState } from 'react'
import { NumberInput } from '@/components/common/number-input'
import { calculateRate, type RateCalcInput } from '@shared/domain/finance'
import { useApi } from '@/lib/query'
import { fmtMoney } from '@/lib/format'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { Page, PageBody, PageHeader } from '@/components/common/page'

const STORAGE_KEY = 'vault-rate-calc'

const DEFAULTS: RateCalcInput = {
  targetNet: 3000,
  hoursPerWeek: 40,
  billableShare: 65,
  feePercent: 10,
  withdrawalFeePercent: 2,
  taxPercent: 5,
  monthlyExpenses: 0,
  vacationWeeks: 4
}

function load(): { input: RateCalcInput; saved: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw)
      return { input: { ...DEFAULTS, ...(JSON.parse(raw) as Partial<RateCalcInput>) }, saved: true }
  } catch {
    /* ignore broken storage */
  }
  return { input: DEFAULTS, saved: false }
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  integer
}: {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  suffix?: string
  min?: number
  max?: number
  integer?: boolean
}) {
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>
        {label}
        {suffix ? `, ${suffix}` : ''}
      </FieldLabel>
      {/* Draft text while typing (clear «1», type «20»); clamped to the schema range on blur. */}
      <NumberInput
        id={id}
        min={min}
        max={max}
        integer={integer}
        value={Number.isFinite(value) ? value : null}
        onChange={(v) => onChange(v ?? min)}
      />
      {hint && <FieldDescription className="text-caption">{hint}</FieldDescription>}
    </Field>
  )
}

export function CalculatorPage() {
  const [{ input: initial, saved }] = useState(load)
  const [input, setInput] = useState<RateCalcInput>(initial)
  const [fixedHours, setFixedHours] = useState(20)
  const { data: overview } = useApi('finance', 'overview')
  const set = <K extends keyof RateCalcInput>(key: K, value: RateCalcInput[K]): void =>
    setInput((s) => ({ ...s, [key]: value }))

  // Prefill expenses with monthly subscriptions (USD) the first time.
  const subsUsd = overview?.monthlySubscriptions.USD
  useEffect(() => {
    if (!saved && subsUsd !== undefined)
      setInput((s) => (s.monthlyExpenses ? s : { ...s, monthlyExpenses: Math.round(subsUsd) }))
  }, [saved, subsUsd])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(input))
  }, [input])

  const r = calculateRate(input)
  const usd = (n: number): string => fmtMoney(n, 'USD')

  return (
    <Page>
      <PageHeader
        title="Калькулятор ставки"
        subtitle="Скільки брати за годину, щоб після комісії платформи, виведення й податків на руках лишалася потрібна сума."
      />
      <PageBody>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Вхідні дані</CardTitle>
              <CardDescription>Зберігаються на цьому комп’ютері.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <NumberField
                id="rc-target"
                label="Хочу на руки за місяць"
                suffix="$"
                value={input.targetNet}
                onChange={(n) => set('targetNet', n)}
                max={10_000_000}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="rc-hours"
                  label="Годин на тиждень"
                  value={input.hoursPerWeek}
                  onChange={(n) => set('hoursPerWeek', n)}
                  min={1}
                  max={100}
                  integer
                />
                <NumberField
                  id="rc-vac"
                  label="Тижнів відпочинку на рік"
                  value={input.vacationWeeks}
                  onChange={(n) => set('vacationWeeks', n)}
                  max={30}
                  integer
                />
              </div>
              <Field className="gap-3">
                <FieldLabel>Оплачуваний час: {input.billableShare}%</FieldLabel>
                <Slider
                  min={5}
                  max={100}
                  step={5}
                  value={[input.billableShare]}
                  onValueChange={([v]) => set('billableShare', v)}
                  aria-label="Частка оплачуваного часу"
                />
                <FieldDescription className="text-caption">
                  Решта — відгуки, дзвінки, правки без оплати, навчання.
                </FieldDescription>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <NumberField
                  id="rc-fee"
                  label="Комісія платформи"
                  suffix="%"
                  value={input.feePercent}
                  onChange={(n) => set('feePercent', n)}
                  max={100}
                />
                <NumberField
                  id="rc-wd"
                  label="Комісія виведення"
                  suffix="%"
                  value={input.withdrawalFeePercent}
                  onChange={(n) => set('withdrawalFeePercent', n)}
                  max={100}
                />
                <NumberField
                  id="rc-tax"
                  label="Податок"
                  suffix="%"
                  value={input.taxPercent}
                  onChange={(n) => set('taxPercent', n)}
                  max={100}
                />
              </div>
              <NumberField
                id="rc-exp"
                label="Витрати на місяць"
                suffix="$"
                hint={
                  subsUsd !== undefined
                    ? `Підписки в розділі «Фінанси»: ${usd(subsUsd)} на місяць`
                    : undefined
                }
                value={input.monthlyExpenses}
                onChange={(n) => set('monthlyExpenses', n)}
                max={10_000_000}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="bg-ink text-ink-foreground">
              <CardHeader>
                <CardTitle className="text-ink-muted">Ставка за годину</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="font-display text-[56px] leading-none tabular-nums">
                  {usd(r.hourlyRate)}
                </div>
                <div className="text-body text-ink-muted">
                  {usd(r.grossNeeded)} на місяць до всіх відрахувань ·{' '}
                  {Math.round(r.billableHoursPerMonth)} оплачуваних годин
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Із чого складається</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemGroup className="gap-1">
                  {r.breakdown.map((b) => (
                    <Item key={b.label} size="xs" variant="muted" className="bg-card">
                      <ItemContent>
                        <ItemTitle className="font-normal">{b.label}</ItemTitle>
                      </ItemContent>
                      <span className="text-body tabular-nums">{usd(b.amount)}</span>
                    </Item>
                  ))}
                  <Separator className="my-1" />
                  <Item size="xs">
                    <ItemContent>
                      <ItemTitle>Треба заробити</ItemTitle>
                    </ItemContent>
                    <span className="text-body font-medium tabular-nums">{usd(r.grossNeeded)}</span>
                  </Item>
                </ItemGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Проєкт за фіксовану ціну</CardTitle>
                <CardDescription>Скільки просити за проєкт за оцінкою в годинах.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-end gap-4">
                <div className="w-32">
                  <NumberField
                    id="rc-fixed"
                    label="Оцінка, годин"
                    value={fixedHours}
                    onChange={setFixedHours}
                    min={1}
                    max={10_000}
                    integer
                  />
                </div>
                <div className="pb-1">
                  <div className="font-display text-[28px] leading-none tabular-nums">
                    {usd(r.hourlyRate * fixedHours)}
                  </div>
                  <div className="mt-1 text-caption text-muted-foreground">
                    + запас на правки 15–20% → {usd(r.hourlyRate * fixedHours * 1.2)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
