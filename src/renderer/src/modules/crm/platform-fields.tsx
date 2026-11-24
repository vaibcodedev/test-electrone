/** Freelance platform bits for clients and contracts (Upwork data, fee %, "на руки"). */
import { Link } from 'react-router'
import { Flag } from 'lucide-react'
import {
  clientInputSchema,
  projectInputSchema,
  type Client,
  type ClientPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import type { Platform } from '@shared/domain/freelance'
import { useApi } from '@/lib/query'
import { rangesOf } from '@/lib/limits'
import { NumberField } from './number-field'
import { CountryCombobox } from './country-combobox'
import { fmtMoney } from '@/lib/format'
import { Field } from '@/components/common/page'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Choice } from './parts'
import { CURRENCY_SIGN } from './labels'

const CLIENT_R = rangesOf(clientInputSchema)
const FEE_RANGE = rangesOf(projectInputSchema).feePercent

export const FEE_HINT =
  'Upwork: 0–15%, точну видно під час відгуку. Порожньо — комісія платформи за замовчуванням.'

export function usePlatforms(): Platform[] {
  const { data = [] } = useApi('platforms', 'list')
  return data
}

/** Parses "12.5" / "12,5" → number, "" → null. */
export function numberOrNull(raw: string): number | null {
  const v = raw.trim().replace(',', '.')
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** «Откуда» — platform or «Напрямую». */
export function PlatformSelect({
  value,
  onChange,
  className
}: {
  value: string | null | undefined
  onChange: (platformId: string | null) => void
  className?: string
}) {
  const platforms = usePlatforms()
  return (
    <Choice
      className={className}
      value={value ?? null}
      none="Напряму"
      onChange={onChange}
      options={platforms.map((p) => ({ value: p.id, label: p.name }))}
    />
  )
}

export function PlatformBadge({
  platformId,
  name
}: {
  platformId: string | null
  name?: string | null
}) {
  const platforms = usePlatforms()
  if (!platformId) return null
  const p = platforms.find((x) => x.id === platformId)
  const label = name ?? p?.name
  if (!label) return null
  return (
    <Badge variant="outline" className="gap-1.5">
      <span
        className="size-1.5 rounded-full"
        style={{ background: p?.color ?? 'var(--muted-foreground)' }}
      />
      {label}
    </Badge>
  )
}

/** Destructive badge for clients marked «Не работать», pointing to the red flags list. */
export function AvoidBadge({ className, link = true }: { className?: string; link?: boolean }) {
  if (!link) {
    return (
      <Badge variant="destructive" className={cn('gap-1', className)}>
        <Flag /> Не працювати
      </Badge>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className={cn('gap-1', className)} asChild>
          <Link to="/freelance/flags">
            <Flag /> Не працювати
          </Link>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Клієнт у стоп-листі — див. «Червоні прапорці»</TooltipContent>
    </Tooltip>
  )
}

export type ClientPlatformData = Pick<
  Client,
  'country' | 'rating' | 'totalSpent' | 'hireRate' | 'paymentVerified'
>

/**
 * Upwork-style client profile data. Controlled (dialog) when `onChange` patches state,
 * or saved on blur (client page) — both via the same `onChange`.
 */
export function ClientPlatformFields({
  value,
  onChange,
  currency = 'USD',
  onInvalidChange
}: {
  value: ClientPlatformData
  onChange: (patch: Partial<ClientPatch>) => void
  /** @deprecated fields commit on blur in every context. */
  saveOnBlur?: boolean
  currency?: string
  /** Dialog: per-field «out of range» flags (see useInvalidFields) to block the submit button. */
  onInvalidChange?: (field: string) => (invalid: boolean) => void
}) {
  // Short labels + the unit inside the input (InputGroup addon): labels never wrap into different
  // heights, and `items-end` keeps the inputs on one line even if one does (docs/design-system.md → Формы).
  // Schema ranges (rating 0–5, hire rate 0–100…) — out-of-range values show an error and aren't saved.
  // Commit on blur works for both the autosaving page and the dialog state.
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="Країна">
          <CountryCombobox value={value.country} onChange={(country) => onChange({ country })} />
        </Field>
        <NumberField
          label="Рейтинг"
          value={value.rating}
          {...CLIENT_R.rating}
          step={0.1}
          placeholder="4.9"
          unit="★"
          onCommit={(rating) => onChange({ rating })}
          onValidityChange={onInvalidChange?.('rating')}
        />
        <NumberField
          label="Витрачено"
          value={value.totalSpent}
          {...CLIENT_R.totalSpent}
          placeholder="25000"
          unit={(CURRENCY_SIGN as Record<string, string>)[currency] ?? currency}
          onCommit={(totalSpent) => onChange({ totalSpent })}
          onValidityChange={onInvalidChange?.('totalSpent')}
        />
        <NumberField
          label="Найм, %"
          value={value.hireRate}
          {...CLIENT_R.hireRate}
          placeholder="70"
          unit="%"
          onCommit={(hireRate) => onChange({ hireRate })}
          onValidityChange={onInvalidChange?.('hireRate')}
        />
      </div>
      <div className="flex h-9 items-center gap-2">
        <Switch
          id="payment-verified"
          checked={!!value.paymentVerified}
          onCheckedChange={(paymentVerified) => onChange({ paymentVerified })}
        />
        <Label htmlFor="payment-verified" className="text-body font-normal text-foreground">
          Оплату верифіковано
        </Label>
      </div>
    </div>
  )
}

/** Fee % input for a contract (shown only when the contract is on a platform). */
export function FeeField({
  value,
  onChange,
  platformDefault,
  onInvalidChange
}: {
  value: number | null | undefined
  onChange: (feePercent: number | null) => void
  /** @deprecated NumberField commits on blur in both cases. */
  saveOnBlur?: boolean
  platformDefault?: number
  /** Dialog: the typed fee is out of range, block submit. */
  onInvalidChange?: (invalid: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <NumberField
        label="Комісія платформи"
        value={value}
        {...FEE_RANGE}
        step={0.5}
        unit="%"
        placeholder={platformDefault !== undefined ? `${platformDefault}` : '10'}
        onCommit={onChange}
        onValidityChange={onInvalidChange}
      />
      <span className="text-meta text-muted-foreground">{FEE_HINT}</span>
    </div>
  )
}

/** "на руки 540 $ (−10%)" — paid amount after the platform fee. */
export function NetPaid({
  project: p,
  className
}: {
  project: ProjectSummary
  className?: string
}) {
  if (!p.platformId || p.billing === 'none') return null
  return (
    <span className={cn('text-caption text-muted-foreground', className)}>
      на руки <span className="text-foreground">{fmtMoney(p.netPaidAmount, p.currency)}</span>
      {p.effectiveFeePercent > 0 && ` (−${p.effectiveFeePercent}%)`}
    </span>
  )
}
