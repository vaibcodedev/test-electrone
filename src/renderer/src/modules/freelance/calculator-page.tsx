import { useEffect, useState } from 'react'
import { calculateRate, type RateCalcInput } from '@shared/domain/finance'
import { useApi } from '@/lib/query'
import { fmtMoney } from '@/lib/format'
import { Input } from '@/components/ui/input'
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
  max
}: {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  suffix?: string
  min?: number
  max?: number
}) {
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>
        {label}
        {suffix ? `, ${suffix}` : ''}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max ?? Infinity, Number(e.target.value) || 0)))
        }
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
        subtitle="Сколько ставить в час, чтобы после комиссии платформы, вывода и налогов на руках осталась нужная сумма."
      />
      <PageBody>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Вводные</CardTitle>
              <CardDescription>Сохраняются на этом компьютере.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <NumberField
                id="rc-target"
                label="Хочу на руки в месяц"
                suffix="$"
                value={input.targetNet}
                onChange={(n) => set('targetNet', n)}
                max={10_000_000}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="rc-hours"
                  label="Часов в неделю"
                  value={input.hoursPerWeek}
                  onChange={(n) => set('hoursPerWeek', Math.max(1, n))}
                  min={1}
                  max={100}
                />
                <NumberField
                  id="rc-vac"
                  label="Недель отдыха в году"
                  value={input.vacationWeeks}
                  onChange={(n) => set('vacationWeeks', n)}
                  max={30}
                />
              </div>
              <Field className="gap-3">
                <FieldLabel>Оплачиваемое время: {input.billableShare}%</FieldLabel>
                <Slider
                  min={5}
                  max={100}
                  step={5}
                  value={[input.billableShare]}
                  onValueChange={([v]) => set('billableShare', v)}
                  aria-label="Доля оплачиваемого времени"
                />
                <FieldDescription className="text-caption">
                  Остальное — отклики, созвоны, правки без оплаты, учёба.
                </FieldDescription>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <NumberField
                  id="rc-fee"
                  label="Комиссия платформы"
                  suffix="%"
                  value={input.feePercent}
                  onChange={(n) => set('feePercent', n)}
                  max={100}
                />
                <NumberField
                  id="rc-wd"
                  label="Комиссия вывода"
                  suffix="%"
                  value={input.withdrawalFeePercent}
                  onChange={(n) => set('withdrawalFeePercent', n)}
                  max={100}
                />
                <NumberField
                  id="rc-tax"
                  label="Налог"
                  suffix="%"
                  value={input.taxPercent}
                  onChange={(n) => set('taxPercent', n)}
                  max={100}
                />
              </div>
              <NumberField
                id="rc-exp"
                label="Расходы в месяц"
                suffix="$"
                hint={
                  subsUsd !== undefined
                    ? `Подписки в разделе «Финансы»: ${usd(subsUsd)} в месяц`
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
                <CardTitle className="text-ink-muted">Ставка в час</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="font-display text-[56px] leading-none tabular-nums">
                  {usd(r.hourlyRate)}
                </div>
                <div className="text-body text-ink-muted">
                  {usd(r.grossNeeded)} в месяц до всех вычетов ·{' '}
                  {Math.round(r.billableHoursPerMonth)} оплачиваемых часов
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Из чего складывается</CardTitle>
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
                      <ItemTitle>Нужно заработать</ItemTitle>
                    </ItemContent>
                    <span className="text-body font-medium tabular-nums">
                      {usd(r.grossNeeded)}
                    </span>
                  </Item>
                </ItemGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Фикс-проект</CardTitle>
                <CardDescription>Сколько просить за проект по оценке в часах.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-end gap-4">
                <div className="w-32">
                  <NumberField
                    id="rc-fixed"
                    label="Оценка, часов"
                    value={fixedHours}
                    onChange={setFixedHours}
                    max={10_000}
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
