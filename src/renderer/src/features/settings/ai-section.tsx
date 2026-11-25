import { useRef, useState, type ReactElement } from 'react'
import { CircleCheck, ExternalLink, KeyRound, PlugZap } from 'lucide-react'
import {
  AI_PRESET_GROUPS,
  AI_PRESETS,
  aiConfigSchema,
  aiKeySchema,
  aiPreset,
  presetNote,
  type AiConfigPatch,
  type AiPreset,
  type AiPresetId,
  type AiStatus
} from '@shared/domain/ai'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtNumber, plural } from '@/lib/format'
import { limitsOf, rangesOf } from '@/lib/limits'
import { openUrl } from '@/lib/open-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Confirm } from '@/components/common/confirm'
import { Field } from '@/components/common/page'
import { NumberInput } from '@/components/common/number-input'
import { ProgressLine } from '@/components/common/progress-line'
import { AutosaveInput } from './autosave-input'
import { SettingsRow, SettingsSection } from './section'

const LIMITS = limitsOf(aiConfigSchema)
const RANGES = rangesOf(aiConfigSchema)
const KEY_MAX = limitsOf(aiKeySchema).key
const URL_PATTERN = /^https?:\/\/[^\s/?#]+\S*$/i

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** «Якщо лишити порожнім — …» under the model field: the recommended model and a smarter one. */
function modelHint(preset: AiPreset): string {
  if (!preset.model)
    return preset.local
      ? 'Якщо лишити порожнім — модель, завантажена в програмі'
      : 'Назва моделі, як її пише сервіс'
  const alt = preset.altModels?.length ? `. Інша: ${preset.altModels.join(', ')}` : ''
  return `Якщо лишити порожнім — ${preset.model}${alt}`
}

/**
 * Settings → «Штучний інтелект»: switch, provider presets with their price and privacy, key (masked once
 * saved), model, daily limit, today's usage and a connection check. Off by default.
 */
export function AiSection(): ReactElement | null {
  const { data: status } = useApi('ai', 'status')
  const save = useApiMutation('ai', 'setConfig')
  if (!status) return null
  const { settings, usage } = status
  const preset = aiPreset(settings.preset)
  const set = (patch: AiConfigPatch): void => save.mutate(patch)
  const tokens = usage.inputTokens + usage.outputTokens

  return (
    <SettingsSection
      id="ai"
      title="Штучний інтелект"
      hint="Модель за вашим ключем пропонує мітки до записів. Запити йдуть лише з Vault на цьому комп’ютері, ключ зашифровано ключем Windows."
    >
      <SettingsRow
        label="Увімкнути ШІ"
        hint={
          settings.enabled
            ? (status.missing ?? 'Кнопка «Запропонувати мітки» є в записах у режимі «Редагувати»')
            : 'Вимкнено — нічого нікуди не надсилається'
        }
      >
        {(id) => (
          <Switch
            id={id}
            checked={settings.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
          />
        )}
      </SettingsRow>

      <SettingsRow label="Провайдер" hint={presetNote(preset)}>
        {(id) => (
          <Select value={settings.preset} onValueChange={(v) => set({ preset: v as AiPresetId })}>
            <SelectTrigger id={id} className="w-72 bg-card" aria-label="Провайдер">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PRESET_GROUPS.map((g) => (
                <SelectGroup key={g.id}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {AI_PRESETS.filter((p) => p.group === g.id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </SettingsRow>

      {preset.id === 'custom' && (
        <AddressRow
          key={settings.baseUrl}
          value={settings.baseUrl}
          onSave={(baseUrl) => set({ baseUrl })}
        />
      )}

      {preset.local && preset.keyUrl && (
        <SettingsRow
          label={`${preset.short} має бути запущено`}
          hint="Ключ не потрібен, ліміти задаєте ви"
        >
          <Button size="sm" variant="soft" onClick={() => void openUrl(preset.keyUrl!)}>
            <ExternalLink /> Завантажити {preset.short}
          </Button>
        </SettingsRow>
      )}

      {(preset.needsKey || preset.id === 'custom') && (
        <AiKeyField key={preset.id} status={status} preset={preset} />
      )}

      <SettingsRow label="Модель" hint={modelHint(preset)}>
        {(id) => (
          <AutosaveInput
            key={preset.id}
            id={id}
            value={settings.model}
            onSave={(model) => model !== settings.model && set({ model })}
            placeholder={preset.model ? `Напр.: ${preset.model}` : 'Напр.: qwen3.5-9b'}
            maxLength={LIMITS.model}
            className="w-56"
          />
        )}
      </SettingsRow>

      <SettingsRow
        label="Ліміт запитів на день"
        hint="Захищає від зайвих витрат: далі запити чекають до завтра"
      >
        {(id) => (
          <NumberInput
            id={id}
            integer
            min={RANGES.dailyLimit?.min}
            max={RANGES.dailyLimit?.max}
            value={settings.dailyLimit}
            onChange={(v) => v !== null && v !== settings.dailyLimit && set({ dailyLimit: v })}
            className="w-24"
          />
        )}
      </SettingsRow>

      <ProgressLine
        continuous
        value={usage.requests}
        total={usage.limit}
        label={`Використано сьогодні: ${fmtNumber(usage.requests)} з ${fmtNumber(usage.limit)} ${plural(usage.limit, ['запиту', 'запитів', 'запитів'])}${tokens ? ` · ${fmtNumber(tokens)} ${plural(tokens, ['токен', 'токени', 'токенів'])}` : ''}`}
        className="px-1 pt-1"
      />

      <AiTestButton
        key={`${preset.id}:${settings.baseUrl}:${settings.model}`}
        local={status.local}
      />
    </SettingsSection>
  )
}

/** «Своя адреса»: saved on blur / Enter, and only a real http(s) address (half-typed text is not sent). */
function AddressRow({
  value,
  onSave
}: {
  value: string
  onSave: (next: string) => void
}): ReactElement {
  const [draft, setDraft] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const commit = (): void => {
    const next = draft.trim()
    if (next && !URL_PATTERN.test(next)) return setInvalid(true)
    setInvalid(false)
    if (next !== value) onSave(next)
  }
  return (
    <SettingsRow
      label="Адреса сервісу"
      hint={
        invalid
          ? 'Адреса має починатися з http:// або https://'
          : 'OpenAI-сумісна, до /v1 включно: Vault допише /chat/completions'
      }
    >
      {(id) => (
        <Input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setInvalid(false)
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-invalid={invalid || undefined}
          placeholder="Напр.: http://localhost:8080/v1"
          maxLength={LIMITS.baseUrl}
          className="w-72"
        />
      )}
    </SettingsRow>
  )
}

/** The key: a password field until saved, then «Ключ збережено ••••1a2b» with «Замінити» and «Видалити». */
function AiKeyField({ status, preset }: { status: AiStatus; preset: AiPreset }): ReactElement {
  const [replacing, setReplacing] = useState(false)
  const [key, setKey] = useState('')
  const [empty, setEmpty] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const save = useApiMutation('ai', 'setKey', {
    successMessage: 'Ключ збережено',
    onSuccess: () => {
      setKey('')
      setReplacing(false)
    }
  })
  const clear = useApiMutation('ai', 'clearKey', { successMessage: 'Ключ видалено' })

  if (status.keyHint !== null && !replacing)
    return (
      <SettingsRow
        label={`Ключ збережено${status.keyHint ? ` ••••${status.keyHint}` : ''}`}
        hint="Зашифровано ключем Windows і не показується в інтерфейсі"
      >
        <Button size="sm" variant="soft" onClick={() => setReplacing(true)}>
          Замінити
        </Button>
        <Confirm
          title="Видалити ключ?"
          description={`Запити до ${preset.short} не працюватимуть, доки ви не додасте новий ключ. Відновити не можна.`}
          confirmLabel="Видалити"
          onConfirm={() => clear.mutate(undefined)}
        >
          <Button size="sm" variant="soft" disabled={clear.isPending}>
            Видалити
          </Button>
        </Confirm>
      </SettingsRow>
    )

  const submit = (): void => {
    if (save.isPending) return
    if (!key.trim()) {
      setEmpty(true)
      inputRef.current?.focus()
      return
    }
    save.mutate({ key: key.trim() })
  }
  return (
    <div className="flex flex-col gap-1 px-1">
      <Field
        label={preset.needsKey ? `Ключ ${preset.short}` : 'Ключ (якщо сервіс його просить)'}
        htmlFor="ai-key"
        hint="Зберігається зашифрованим ключем Windows і йде лише до вибраного провайдера."
        error={empty ? 'Вставте ключ' : undefined}
      >
        <div className="flex items-center gap-2">
          <InputGroup className="h-9 flex-1 bg-card">
            <InputGroupAddon>
              <KeyRound />
            </InputGroupAddon>
            <InputGroupInput
              id="ai-key"
              ref={inputRef}
              type="password"
              autoComplete="off"
              value={key}
              maxLength={KEY_MAX}
              aria-invalid={empty || undefined}
              aria-describedby={empty ? 'ai-key-error' : 'ai-key-hint'}
              placeholder="Вставте ключ"
              onChange={(e) => {
                setKey(e.target.value)
                setEmpty(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </InputGroup>
          <Button variant="subtle" disabled={save.isPending} onClick={submit}>
            Зберегти
          </Button>
          {replacing && (
            <Button variant="soft" onClick={() => setReplacing(false)}>
              Скасувати
            </Button>
          )}
        </div>
      </Field>
      {preset.keyUrl && (
        <Button
          variant="link"
          className="self-start text-caption"
          onClick={() => void openUrl(preset.keyUrl!)}
        >
          <ExternalLink /> Отримати ключ на {hostOf(preset.keyUrl)}
        </Button>
      )}
    </div>
  )
}

/** «Перевірити підключення» and its answer next to it (not a toast: the result belongs to this section). */
function AiTestButton({ local }: { local: boolean }): ReactElement {
  const test = useApiMutation('ai', 'test', { silent: true })
  const seconds = test.data
    ? (test.data.ms / 1000).toLocaleString('uk-UA', { maximumFractionDigits: 1 })
    : ''
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <Button variant="subtle" disabled={test.isPending} onClick={() => test.mutate(undefined)}>
        {test.isPending ? <Spinner /> : <PlugZap />}
        {local ? 'Перевірити, чи запущено' : 'Перевірити підключення'}
      </Button>
      <p role="status" className="min-w-0 flex-1 text-caption" data-testid="ai-test-result">
        {test.isSuccess && (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <CircleCheck aria-hidden className="size-4 text-success" />
            Працює: {test.data.model}, відповідь за {seconds} с
          </span>
        )}
        {test.isError && <span className="text-destructive">{test.error.message}</span>}
      </p>
    </div>
  )
}
