/** Freelance platform bits for clients and contracts (Upwork data, fee %, "на руки"). */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Flag } from 'lucide-react'
import type { Client, ClientPatch, ProjectSummary } from '@shared/domain/crm'
import type { Platform } from '@shared/domain/freelance'
import { useApi } from '@/lib/query'
import { fmtMoney } from '@/lib/format'
import { Field } from '@/components/common/page'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Choice } from './parts'

export const FEE_HINT = 'Upwork: 0–15%, точную видно при отклике. Пусто — комиссия платформы по умолчанию.'

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
      none="Напрямую"
      onChange={onChange}
      options={platforms.map((p) => ({ value: p.id, label: p.name }))}
    />
  )
}

export function PlatformBadge({ platformId, name }: { platformId: string | null; name?: string | null }) {
  const platforms = usePlatforms()
  if (!platformId) return null
  const p = platforms.find((x) => x.id === platformId)
  const label = name ?? p?.name
  if (!label) return null
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className="size-1.5 rounded-full" style={{ background: p?.color ?? 'var(--muted-foreground)' }} />
      {label}
    </Badge>
  )
}

/** Destructive badge for clients marked «Не работать», pointing to the red flags list. */
export function AvoidBadge({ className, link = true }: { className?: string; link?: boolean }) {
  if (!link) {
    return (
      <Badge variant="destructive" className={cn('gap-1', className)}>
        <Flag /> Не работать
      </Badge>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className={cn('gap-1', className)} asChild>
          <Link to="/freelance/flags">
            <Flag /> Не работать
          </Link>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Клиент в стоп-листе — см. «Красные флаги»</TooltipContent>
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
  saveOnBlur,
  currency = 'USD'
}: {
  value: ClientPlatformData
  onChange: (patch: Partial<ClientPatch>) => void
  /** true → uncontrolled inputs that save on blur (client page). */
  saveOnBlur?: boolean
  currency?: string
}) {
  const num = (
    key: 'rating' | 'totalSpent' | 'hireRate',
    label: string,
    placeholder: string
  ): ReactNode => (
    <Field label={label}>
      {saveOnBlur ? (
        <Input
          inputMode="decimal"
          defaultValue={value[key] ?? ''}
          placeholder={placeholder}
          onBlur={(e) => {
            const n = numberOrNull(e.target.value)
            if (n !== value[key]) onChange({ [key]: n })
          }}
        />
      ) : (
        <Input
          inputMode="decimal"
          value={value[key] ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange({ [key]: numberOrNull(e.target.value) })}
        />
      )}
    </Field>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Страна">
          {saveOnBlur ? (
            <Input
              defaultValue={value.country}
              placeholder="USA"
              onBlur={(e) => e.target.value.trim() !== value.country && onChange({ country: e.target.value.trim() })}
            />
          ) : (
            <Input value={value.country} placeholder="USA" onChange={(e) => onChange({ country: e.target.value })} />
          )}
        </Field>
        {num('rating', 'Рейтинг', '4.9')}
        {num('totalSpent', `Потратил на платформе, ${currency}`, '25000')}
        {num('hireRate', 'Hire rate, %', '70')}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="payment-verified"
          checked={!!value.paymentVerified}
          onCheckedChange={(paymentVerified) => onChange({ paymentVerified })}
        />
        <Label htmlFor="payment-verified" className="text-[13px] font-normal text-foreground">
          Оплата верифицирована
        </Label>
      </div>
    </div>
  )
}

/** Fee % input for a contract (shown only when the contract is on a platform). */
export function FeeField({
  value,
  onChange,
  saveOnBlur,
  platformDefault
}: {
  value: number | null | undefined
  onChange: (feePercent: number | null) => void
  saveOnBlur?: boolean
  platformDefault?: number
}) {
  const placeholder = platformDefault !== undefined ? `${platformDefault}` : '10'
  return (
    <Field label="Комиссия платформы, %">
      {saveOnBlur ? (
        <Input
          inputMode="decimal"
          defaultValue={value ?? ''}
          placeholder={placeholder}
          onBlur={(e) => {
            const n = numberOrNull(e.target.value)
            if (n !== (value ?? null)) onChange(n === null ? null : Math.min(100, Math.max(0, n)))
          }}
        />
      ) : (
        <Input
          inputMode="decimal"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => {
            const n = numberOrNull(e.target.value)
            onChange(n === null ? null : Math.min(100, Math.max(0, n)))
          }}
        />
      )}
      <span className="text-[11.5px] text-muted-foreground">{FEE_HINT}</span>
    </Field>
  )
}

/** "на руки 540 $ (−10%)" — paid amount after the platform fee. */
export function NetPaid({ project: p, className }: { project: ProjectSummary; className?: string }) {
  if (!p.platformId || p.billing === 'none') return null
  return (
    <span className={cn('text-[12px] text-muted-foreground', className)}>
      на руки <span className="text-foreground">{fmtMoney(p.netPaidAmount, p.currency)}</span>
      {p.effectiveFeePercent > 0 && ` (−${p.effectiveFeePercent}%)`}
    </span>
  )
}
