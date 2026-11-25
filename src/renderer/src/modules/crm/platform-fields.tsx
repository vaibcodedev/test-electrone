/** Freelance platform bits for clients and contracts (Upwork data, fee %, "на руки"). */
import { VERIFIED_HINT } from '../freelance/g2-labels'
import { useId, type ReactElement } from 'react'
import { Link } from 'react-router'
import { Flag } from 'lucide-react'
import {
  clientInputSchema,
  projectInputSchema,
  type Client,
  type ClientPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { rangesOf } from '@/lib/limits'
import { NumberField } from '@/components/common/number-field'
import { CountryCombobox } from '@/components/common/country-combobox'
import { fmtMoney, fmtPercent } from '@/lib/format'
import { Field } from '@/components/common/page'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Choice } from '@/components/common/choice'
import { CURRENCY_SIGN, NO_PLATFORM } from './labels'
import { usePlatforms } from './use-platforms'

const CLIENT_R = rangesOf(clientInputSchema)
const FEE_RANGE = rangesOf(projectInputSchema).feePercent

/** Platform of a client or contract, or «Без платформи». */
export function PlatformSelect({
  id,
  'aria-label': ariaLabel,
  value,
  onChange
}: {
  id?: string
  /** Where the visible label is a SectionLabel, not a Field tied by `id`. */
  'aria-label'?: string
  value: string | null | undefined
  onChange: (platformId: string | null) => void
}): ReactElement {
  const platforms = usePlatforms()
  return (
    <Choice
      id={id}
      aria-label={ariaLabel}
      value={value ?? null}
      none={NO_PLATFORM}
      onChange={onChange}
      options={platforms.map((p) => ({ value: p.id, label: p.name }))}
    />
  )
}

/** Name and colour dot of a platform (the stored name wins: a deleted platform keeps its label). */
function usePlatformLabel(
  platformId: string | null,
  name?: string | null
): { label: string; dot: ReactElement } | null {
  const platforms = usePlatforms()
  if (!platformId) return null
  const p = platforms.find((x) => x.id === platformId)
  const label = name ?? p?.name
  if (!label) return null
  const dot = (
    <span
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: p?.color ?? 'var(--muted-foreground)' }}
    />
  )
  return { label, dot }
}

/** Platform colour dot + name as text (rows, record view); nothing for an unknown platform. */
export function PlatformName({
  platformId,
  name,
  className
}: {
  platformId: string | null
  name?: string | null
  className?: string
}): ReactElement | null {
  const p = usePlatformLabel(platformId, name)
  if (!p) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {p.dot}
      <span className="truncate">{p.label}</span>
    </span>
  )
}

export function PlatformBadge({
  platformId,
  name
}: {
  platformId: string | null
  name?: string | null
}): ReactElement | null {
  const p = usePlatformLabel(platformId, name)
  if (!p) return null
  return (
    <Badge variant="outline" className="gap-1.5">
      {p.dot}
      {p.label}
    </Badge>
  )
}

/**
 * Destructive badge for clients marked «Не працювати», pointing to the red flags list. The record header
 * passes another `label`: its status select already says «Не працювати».
 */
export function AvoidBadge({
  className,
  link = true,
  label = 'Не працювати'
}: {
  className?: string
  link?: boolean
  label?: string
}): ReactElement {
  if (!link) {
    return (
      <Badge variant="destructive" className={cn('gap-1', className)}>
        <Flag /> {label}
      </Badge>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className={cn('gap-1', className)} asChild>
          <Link to="/freelance/flags">
            <Flag /> {label}
          </Link>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Клієнт у стоп-листі — див. «Червоні прапорці»</TooltipContent>
    </Tooltip>
  )
}

type ClientPlatformData = Pick<
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
  currency?: string
  /** Dialog: per-field «out of range» flags (see useInvalidFields) to block the submit button. */
  onInvalidChange?: (field: string) => (invalid: boolean) => void
}): ReactElement {
  // Short labels + the unit inside the input (InputGroup addon): labels never wrap into different
  // heights, and `items-end` keeps the inputs on one line even if one does (docs/design-system.md → Формы).
  // Schema rules (rating 1–5 step 0,1, hire rate a whole 0–100, spent a whole up to 100 million): typing stops at
  // what can't fit, a pasted value that doesn't fit shows an error and isn't saved.
  // Commit on blur works for both the autosaving page and the dialog state.
  const verifiedId = useId()
  const countryId = useId()
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="Країна" htmlFor={countryId}>
          <CountryCombobox
            id={countryId}
            value={value.country}
            onChange={(country) => onChange({ country })}
          />
        </Field>
        <NumberField
          label="Рейтинг"
          // An old 0 means «no rating yet»: shown empty, not as an error.
          value={value.rating || null}
          {...CLIENT_R.rating}
          placeholder="Напр.: 4,9"
          unit="★"
          onCommit={(rating) => onChange({ rating })}
          onValidityChange={onInvalidChange?.('rating')}
        />
        <NumberField
          label="Витрачено"
          value={value.totalSpent}
          {...CLIENT_R.totalSpent}
          placeholder="Напр.: 25 000"
          unit={(CURRENCY_SIGN as Record<string, string>)[currency] ?? currency}
          onCommit={(totalSpent) => onChange({ totalSpent })}
          onValidityChange={onInvalidChange?.('totalSpent')}
        />
        <NumberField
          label="Найм"
          value={value.hireRate}
          {...CLIENT_R.hireRate}
          placeholder="Напр.: 70"
          unit="%"
          onCommit={(hireRate) => onChange({ hireRate })}
          onValidityChange={onInvalidChange?.('hireRate')}
        />
      </div>
      <div className="flex h-9 items-center gap-2">
        <Switch
          id={verifiedId}
          checked={!!value.paymentVerified}
          onCheckedChange={(paymentVerified) => onChange({ paymentVerified })}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Label
              htmlFor={verifiedId}
              className="cursor-help text-body font-normal text-foreground"
            >
              Оплату верифіковано
            </Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{VERIFIED_HINT}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

/** Fee % input for a contract (shown only when the contract is on a platform). */
export function FeeField({
  value,
  onChange,
  platformDefault,
  platformName,
  onInvalidChange
}: {
  value: number | null | undefined
  onChange: (feePercent: number | null) => void
  platformDefault?: number
  platformName?: string
  /** Dialog: the typed fee is out of range, block submit. */
  onInvalidChange?: (invalid: boolean) => void
}): ReactElement {
  const typical = platformDefault !== undefined && platformDefault > 0
  return (
    <NumberField
      label="Комісія платформи"
      value={value}
      {...FEE_RANGE}
      step={0.5}
      unit="%"
      hint={
        typical
          ? `Порожньо — типова комісія ${platformName ?? 'платформи'}: ${fmtPercent(platformDefault)}`
          : 'Порожньо — без комісії'
      }
      onCommit={onChange}
      onValidityChange={onInvalidChange}
    />
  )
}

/** "на руки 540 $ (−10%)" — paid amount after the platform fee. */
export function NetPaid({ project: p }: { project: ProjectSummary }): ReactElement | null {
  // Nothing paid yet: «на руки 0,00 USD» would pass a zero off as data; the fee is in «Умови».
  if (!p.platformId || p.billing === 'none' || p.netPaidAmount === 0) return null
  return (
    <span className="text-caption text-muted-foreground">
      на руки <span className="text-foreground">{fmtMoney(p.netPaidAmount, p.currency)}</span>
      {p.effectiveFeePercent > 0 && ` (−${fmtPercent(p.effectiveFeePercent)})`}
    </span>
  )
}
