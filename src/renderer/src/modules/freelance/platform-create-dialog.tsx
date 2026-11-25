import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { CURRENCIES, type Currency } from '@shared/domain/crm'
import {
  PLATFORM_KINDS,
  platformInputSchema,
  type PlatformKind,
  type PreCheck
} from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useUi } from '@/stores/ui-store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Field } from '@/components/common/page'
import { FormDialog } from '@/components/common/form-dialog'
import { NumberField, useInvalidFields } from '@/components/common/number-field'
import { Choice } from '../crm/parts'
import { PLATFORM_KIND_LABEL } from './proposal-labels'
import { ColorSwatches } from './color-swatches'

const PLATFORM_L = limitsOf(platformInputSchema)
const PLATFORM_R = rangesOf(platformInputSchema)

interface Preset {
  name: string
  color: string | null
  creditsName: string
  creditPrice: number
  defaultFeePercent: number
  hint: string
}

const PRESETS: Record<PlatformKind, Preset> = {
  upwork: {
    name: 'Upwork',
    color: '#14a800',
    creditsName: 'Connects',
    creditPrice: 0.15,
    defaultFeePercent: 10,
    hint: 'Конекти за відгуки, комісія 0–15% за контрактом'
  },
  freelancehunt: {
    name: 'Freelancehunt',
    color: '#2f7dd1',
    creditsName: '',
    creditPrice: 0,
    defaultFeePercent: 0,
    hint: 'Ставки на проєкти, свою комісію вкажіть у налаштуваннях'
  },
  direct: {
    name: 'Прямі замовлення',
    color: null,
    creditsName: '',
    creditPrice: 0,
    defaultFeePercent: 0,
    hint: 'Клієнти напряму, без платформи й комісії'
  },
  other: {
    name: '',
    color: '#8e4ec6',
    creditsName: '',
    creditPrice: 0,
    defaultFeePercent: 0,
    hint: 'Будь-яка інша біржа чи канал'
  }
}

const DEFAULT_CHECKLIST: PreCheck[] = [
  { id: 'scope', label: 'ТЗ зрозуміле, можу оцінити обсяг' },
  { id: 'budget', label: 'Бюджет відповідає моїй ставці' },
  { id: 'flags', label: 'Немає червоних прапорців в описі й відгуках' }
]

const START_KIND: PlatformKind = 'freelancehunt'

/** «+ Платформа» dialog, mounted once in the shell and opened from the sidebar. */
export function PlatformDialogHost(): ReactElement {
  const open = useUi((s) => s.platformDialogOpen)
  const setOpen = useUi((s) => s.setPlatformDialogOpen)
  const navigate = useNavigate()
  const numbers = useInvalidFields()
  const [kind, setKind] = useState<PlatformKind>(START_KIND)
  const [name, setName] = useState(PRESETS[START_KIND].name)
  const [color, setColor] = useState<string | null>(PRESETS[START_KIND].color)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [creditsName, setCreditsName] = useState('')
  const [fee, setFee] = useState<number | null>(0)
  const create = useApiMutation('platforms', 'create', {
    successMessage: 'Платформу додано',
    onSuccess: (p) => {
      setOpen(false)
      navigate(`/freelance/p/${p.id}`)
    }
  })

  const pickKind = (k: PlatformKind): void => {
    const p = PRESETS[k]
    setKind(k)
    setName(p.name)
    setColor(p.color)
    setCreditsName(p.creditsName)
    setFee(p.defaultFeePercent)
  }

  // Every opening starts from the default preset (reset while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      pickKind(START_KIND)
      setCurrency('USD')
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="Нова платформа"
      description="Кожна платформа має свої відгуки, контракти, комісію й статистику."
      submitLabel="Додати платформу"
      invalid={!name.trim() || numbers.invalid}
      pending={create.isPending}
      onSubmit={() =>
        create.mutate({
          name: name.trim(),
          kind,
          color,
          currency,
          creditsName: creditsName.trim(),
          creditPrice: PRESETS[kind].creditPrice,
          defaultFeePercent: fee ?? 0,
          preChecklist: DEFAULT_CHECKLIST
        })
      }
    >
      <RadioGroup
        value={kind}
        onValueChange={(v) => pickKind(v as PlatformKind)}
        className="grid grid-cols-2 gap-2"
      >
        {PLATFORM_KINDS.map((k) => (
          <Label
            key={k}
            htmlFor={`kind-${k}`}
            // DS «Выбор режима с пояснением»: no fill until chosen; the chosen one is a light tint + thin ring.
            className="flex cursor-pointer flex-col items-start gap-1 rounded-2xl p-3 text-foreground transition-colors hover:bg-foreground/5 has-data-[state=checked]:bg-surface has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-foreground/15"
          >
            <span className="flex w-full items-center gap-2 text-body font-medium">
              <RadioGroupItem id={`kind-${k}`} value={k} />
              {PLATFORM_KIND_LABEL[k]}
            </span>
            <span className="text-caption leading-snug font-normal text-muted-foreground">
              {PRESETS[k].hint}
            </span>
          </Label>
        ))}
      </RadioGroup>
      <div className="grid grid-cols-2 items-start gap-4">
        <Field label="Назва" error={name.trim() ? undefined : 'Вкажіть назву'}>
          <Input
            value={name}
            maxLength={PLATFORM_L.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Наприклад, Fiverr"
            aria-invalid={!name.trim() || undefined}
            autoFocus
          />
        </Field>
        <Field label="Валюта">
          <Choice
            value={currency}
            onChange={(v) => v && setCurrency(v)}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Платні відгуки називаються">
          <Input
            value={creditsName}
            maxLength={PLATFORM_L.creditsName}
            onChange={(e) => setCreditsName(e.target.value)}
            placeholder="Порожньо — безкоштовні"
          />
        </Field>
        <NumberField
          label="Комісія за замовчуванням"
          value={fee}
          {...PLATFORM_R.defaultFeePercent}
          step={0.5}
          unit="%"
          onCommit={setFee}
          onValidityChange={numbers.report('fee')}
        />
      </div>
      <Field label="Колір">
        <ColorSwatches value={color} onChange={setColor} />
      </Field>
    </FormDialog>
  )
}
