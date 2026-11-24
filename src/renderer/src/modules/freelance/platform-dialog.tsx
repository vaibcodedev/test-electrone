import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { CURRENCIES, type Currency } from '@shared/domain/crm'
import {
  PLATFORM_KINDS,
  platformInputSchema,
  preCheckSchema,
  type Platform,
  type PlatformKind,
  type PlatformPatch,
  type PreCheck
} from '@shared/domain/freelance'
import { toast } from 'sonner'
import { useApiMutation } from '@/lib/query'
import { NumberInput } from '@/components/common/number-input'
import { draftToNumber, numberToDraft } from '../crm/money'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useAutosave } from '@/hooks/use-autosave'
import { useUi } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field } from '@/components/common/page'
import { Choice } from '../crm/parts'
import { PLATFORM_COLORS, PLATFORM_KIND_LABEL } from './proposal-labels'

const CHECK_MAX = limitsOf(preCheckSchema).label

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

function ColorSwatches({
  value,
  onChange
}: {
  value: string | null
  onChange: (c: string | null) => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={value ?? 'none'}
      onValueChange={(v) => v && onChange(v === 'none' ? null : v)}
      spacing={1}
    >
      <ToggleGroupItem
        value="none"
        aria-label="Без кольору"
        className="size-7 min-w-7 rounded-full p-0 ring-1 ring-border on:ring-2 on:ring-foreground"
      >
        <span className="size-3 rounded-full bg-muted-foreground/40" />
      </ToggleGroupItem>
      {PLATFORM_COLORS.map((c) => (
        <ToggleGroupItem
          key={c}
          value={c}
          aria-label={c}
          className="size-7 min-w-7 rounded-full p-0 on:bg-transparent on:ring-2 on:ring-foreground"
        >
          <span className="size-5 rounded-full" style={{ background: c }} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** «+ Платформа» dialog, mounted once in the shell and opened from the sidebar. */
export function PlatformDialogHost() {
  const open = useUi((s) => s.platformDialogOpen)
  const setOpen = useUi((s) => s.setPlatformDialogOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[520px]">
        {open && <CreatePlatformForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CreatePlatformForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const [kind, setKind] = useState<PlatformKind>('freelancehunt')
  const [name, setName] = useState(PRESETS.freelancehunt.name)
  const [color, setColor] = useState<string | null>(PRESETS.freelancehunt.color)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [creditsName, setCreditsName] = useState('')
  const [fee, setFee] = useState('0')
  const create = useApiMutation('platforms', 'create', {
    successMessage: 'Платформу додано',
    onSuccess: (p) => {
      onDone()
      navigate(`/freelance/p/${p.id}`)
    }
  })

  const pickKind = (k: PlatformKind): void => {
    const p = PRESETS[k]
    setKind(k)
    setName(p.name)
    setColor(p.color)
    setCreditsName(p.creditsName)
    setFee(String(p.defaultFeePercent))
  }

  const feeNum = Number(fee.replace(',', '.'))
  const valid = name.trim() && !Number.isNaN(feeNum) && feeNum >= 0 && feeNum <= 100

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid || create.isPending) return
        create.mutate({
          name: name.trim(),
          kind,
          color,
          currency,
          creditsName: creditsName.trim(),
          creditPrice: PRESETS[kind].creditPrice,
          defaultFeePercent: feeNum,
          preChecklist: DEFAULT_CHECKLIST
        })
      }}
    >
      <DialogHeader>
        <DialogTitle className="font-display text-heading">Нова платформа</DialogTitle>
        <DialogDescription>
          Кожна платформа має свої відгуки, контракти, комісію й статистику.
        </DialogDescription>
      </DialogHeader>
      <RadioGroup
        value={kind}
        onValueChange={(v) => pickKind(v as PlatformKind)}
        className="grid grid-cols-2 gap-2"
      >
        {PLATFORM_KINDS.map((k) => (
          <Label
            key={k}
            htmlFor={`kind-${k}`}
            className={cn(
              'flex cursor-pointer flex-col items-start gap-1 rounded-2xl bg-surface p-3 text-foreground ring-1 ring-transparent transition-colors',
              kind === k && 'ring-2 ring-foreground'
            )}
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Назва">
          <Input
            value={name}
            maxLength={PLATFORM_L.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Наприклад, Fiverr"
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
        <Field label="Комісія за замовчуванням">
          <InputGroup>
            <NumberInput
              data-slot="input-group-control"
              className="flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
              allowEmpty
              {...PLATFORM_R.defaultFeePercent}
              step={0.5}
              value={draftToNumber(fee)}
              onChange={(v) => setFee(numberToDraft(v))}
            />
            <InputGroupAddon align="inline-end">%</InputGroupAddon>
          </InputGroup>
        </Field>
      </div>
      <Field label="Колір">
        <ColorSwatches value={color} onChange={setColor} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Скасувати
        </Button>
        <Button type="submit" variant="lime" disabled={!valid || create.isPending}>
          <Plus /> Додати платформу
        </Button>
      </DialogFooter>
    </form>
  )
}

/* ───────── settings tab ───────── */

/** Shared NumberInput (schema range via rangesOf, clamped on blur) with a unit addon. */
function NumberSetting({
  label,
  value,
  onCommit,
  suffix,
  step,
  min,
  max
}: {
  label: string
  value: number
  onCommit: (n: number) => void
  suffix?: string
  step?: number
  min?: number
  max?: number
}) {
  return (
    <Field label={label}>
      <InputGroup>
        <NumberInput
          data-slot="input-group-control"
          className="flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(n) => n !== null && n !== value && onCommit(n)}
        />
        {suffix && <InputGroupAddon align="inline-end">{suffix}</InputGroupAddon>}
      </InputGroup>
    </Field>
  )
}

function ChecklistEditor({
  items,
  onChange
}: {
  items: PreCheck[]
  onChange: (items: PreCheck[]) => void
}) {
  const [text, setText] = useState('')
  const move = (i: number, d: -1 | 1): void => {
    const next = [...items]
    const [it] = next.splice(i, 1)
    next.splice(i + d, 0, it)
    onChange(next)
  }
  const add = (): void => {
    const label = text.trim()
    if (!label) return
    onChange([...items, { id: `c${Date.now().toString(36)}`, label }])
    setText('')
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((c, i) => (
        <ChecklistRow
          key={c.id}
          item={c}
          first={i === 0}
          last={i === items.length - 1}
          onRename={(label) => onChange(items.map((x) => (x.id === c.id ? { ...x, label } : x)))}
          onUp={() => move(i, -1)}
          onDown={() => move(i, 1)}
          onRemove={() => onChange(items.filter((x) => x.id !== c.id))}
        />
      ))}
      <InputGroup>
        <InputGroupInput
          value={text}
          maxLength={CHECK_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Новий пункт, наприклад «Клієнт із потрібного часового поясу»"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="xs"
            className="rounded-full"
            disabled={!text.trim()}
            onClick={add}
          >
            <Plus /> Додати
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function ChecklistRow({
  item,
  first,
  last,
  onRename,
  onUp,
  onDown,
  onRemove
}: {
  item: PreCheck
  first: boolean
  last: boolean
  onRename: (label: string) => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}) {
  const [label, setLabel] = useAutosave(item.label, (l) => l.trim() && onRename(l.trim()))
  return (
    <div className="group flex items-center gap-1.5">
      <Input
        value={label}
        maxLength={CHECK_MAX}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Пункт чек-листа"
      />
      <Button variant="ghost" size="icon-sm" disabled={first} onClick={onUp} aria-label="Вище">
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={last} onClick={onDown} aria-label="Нижче">
        <ArrowDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Видалити пункт"
        className="hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

/** «Настройки» tab of a platform page. */
export function PlatformSettingsTab({ platform }: { platform: Platform }) {
  const update = useApiMutation('platforms', 'update')
  const patch = (p: PlatformPatch): void => update.mutate({ id: platform.id, patch: p })
  const [name, setName] = useAutosave(platform.name, (n) => n.trim() && patch({ name: n.trim() }))
  const [creditsName, setCreditsName] = useAutosave(platform.creditsName, (c) =>
    patch({ creditsName: c.trim() })
  )
  const [notes, setNotes] = useAutosave(platform.notes, (n) => patch({ notes: n }))

  return (
    <div className="grid max-w-5xl grid-cols-2 gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Основне</CardTitle>
          <CardDescription>
            Назва, валюта й комісія за замовчуванням для нових контрактів.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Назва">
            <Input
              value={name}
              maxLength={PLATFORM_L.name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Валюта">
              <Choice
                value={platform.currency}
                onChange={(v) => v && patch({ currency: v })}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <NumberSetting
              label="Комісія за замовчуванням"
              value={platform.defaultFeePercent}
              onCommit={(defaultFeePercent) => patch({ defaultFeePercent })}
              suffix="%"
              step={0.5}
              {...PLATFORM_R.defaultFeePercent}
            />
            <Field label="Платні відгуки називаються">
              <Input
                value={creditsName}
                maxLength={PLATFORM_L.creditsName}
                onChange={(e) => setCreditsName(e.target.value)}
                placeholder="Connects; порожньо — безкоштовні"
              />
            </Field>
            <NumberSetting
              label="Ціна одного при купівлі"
              value={platform.creditPrice}
              onCommit={(creditPrice) => patch({ creditPrice })}
              suffix={platform.currency}
              step={0.01}
              {...PLATFORM_R.creditPrice}
            />
          </div>
          <Field label="Колір">
            <ColorSwatches value={platform.color} onChange={(color) => patch({ color })} />
          </Field>
          <Field label="Нотатки про платформу">
            <Textarea
              value={notes}
              maxLength={PLATFORM_L.notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Правила, ліміти, особливості комісії"
              className="min-h-24"
            />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-card px-4 py-3">
            <Label
              htmlFor={`archive-${platform.id}`}
              className="flex flex-col items-start gap-1 text-foreground"
            >
              <span className="text-body font-normal">В архіві</span>
              <span className="text-caption font-normal text-muted-foreground">
                Сховати з меню. Відгуки й контракти збережуться.
              </span>
            </Label>
            <Switch
              id={`archive-${platform.id}`}
              checked={platform.archived}
              onCheckedChange={(archived) => {
                // Stay here: the page shows an «в архіві» banner with a way back.
                patch({ archived })
                if (archived)
                  toast.success(`${platform.name} у архіві`, {
                    action: { label: 'Скасувати', onClick: () => patch({ archived: false }) }
                  })
                else toast.success(`${platform.name} знову в меню`)
              }}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Чек-лист перед відгуком</CardTitle>
          <CardDescription>
            З’являється в кожному відгуку цієї платформи. Допомагає не витрачати{' '}
            {platform.creditsName || 'час'} на погані вакансії.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChecklistEditor
            items={platform.preChecklist}
            onChange={(preChecklist) => patch({ preChecklist })}
          />
        </CardContent>
      </Card>
    </div>
  )
}
