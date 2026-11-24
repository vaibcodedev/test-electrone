import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { useNavigate } from 'react-router'
import { Building2, Check, ChevronsUpDown, ExternalLink, Plus, X } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { api } from '@/lib/api'
import { useAutosave } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Field } from '@/components/common/page'
import { FieldError } from '@/components/ui/field'
import { isLikelyUrl, URL_ERROR } from '@/lib/limits'

/** Number input that commits on blur/Enter (null when empty). */
export function NumberInput({
  value,
  onCommit,
  placeholder,
  min = 0,
  max,
  step = 1,
  suffix,
  id
}: {
  value: number | null
  onCommit: (value: number | null) => void
  placeholder?: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  id?: string
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])
  const commit = (): void => {
    const trimmed = text.trim().replace(',', '.')
    const next = trimmed === '' ? null : Number(trimmed)
    if (next !== null && Number.isNaN(next)) return setText(value === null ? '' : String(value))
    if (next !== value) onCommit(next)
  }
  const common = {
    id,
    type: 'number' as const,
    inputMode: 'decimal' as const,
    min,
    max,
    step,
    value: text,
    placeholder,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && commit(),
    className: 'tabular-nums'
  }
  if (!suffix) return <Input {...common} />
  return (
    <InputGroup>
      <InputGroupInput {...common} />
      <InputGroupAddon align="inline-end">{suffix}</InputGroupAddon>
    </InputGroup>
  )
}

/** Text field with autosave and a label. */
export function TextField({
  label,
  value,
  onSave,
  placeholder,
  className,
  maxLength
}: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
  className?: string
  /** From the schema via limitsOf(): the input stops where the server would reject. */
  maxLength?: number
}) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Field label={label} className={className}>
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
    </Field>
  )
}

/**
 * URL input with an «open in browser» button. Typing is never blocked; a value that doesn't look
 * like a link shows URL_ERROR under the field and is not saved (docs/design-system.md → Формы).
 */
export function LinkInput({
  value,
  onSave,
  placeholder = 'https://…',
  maxLength = 2000,
  strict = true
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  maxLength?: number
  /** false: links or plain text are both fine (e.g. "call link or office address"). */
  strict?: boolean
}) {
  const [draft, setDraft] = useAutosave(value, (v) => {
    if (!strict || isLikelyUrl(v)) onSave(v.trim())
  })
  const valid = /^https?:\/\//i.test(draft)
  const bad = strict && !isLikelyUrl(draft)
  return (
    <>
    <InputGroup>
      <InputGroupInput
        type={strict ? 'url' : 'text'}
        inputMode={strict ? 'url' : undefined}
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={bad || undefined}
      />
      {valid && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" className="rounded-full" aria-label="Відкрити посилання" onClick={() => void api.app.openExternal(draft)}>
            <ExternalLink />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
    {bad && <FieldError className="text-caption">{URL_ERROR}</FieldError>}
    </>
  )
}

export interface CompanyValue {
  companyId: string | null
  companyName: string
}

/**
 * Company combobox: pick an existing company card, create one from the typed name,
 * or keep it as free text. Shows a link to the company card when one is linked.
 */
export function CompanyCombobox({
  value,
  onChange,
  showLink = true
}: {
  value: CompanyValue
  onChange: (value: CompanyValue) => void
  showLink?: boolean
}) {
  // View mode: the value as plain text, no picker (it would change the record outside «Редагувати»).
  const readOnly = useReadOnly()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Server search, 30 at a time (the companies list can grow without bound).
  const debounced = useDebounced(query.trim())
  const { data: list = [] } = useApi('jobs', 'companies', { search: debounced || undefined, limit: 30 }, { enabled: open })
  const { data: selected } = useApi('jobs', 'company', value.companyId ?? '', { enabled: !!value.companyId })
  const create = useApiMutation('jobs', 'createCompany')
  const current = selected ?? (value.companyId ? list.find((c) => c.id === value.companyId) : undefined)
  const label = current?.name ?? value.companyName
  const q = query.trim()
  const exact = list.some((c) => c.name.toLowerCase() === q.toLowerCase())

  const pick = (next: CompanyValue): void => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="flex gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="soft"
            disabled={readOnly}
            className={cn('min-w-0 flex-1 justify-between rounded-xl font-normal', !label && 'text-muted-foreground', readOnly && 'pointer-events-none bg-transparent px-0 shadow-none disabled:opacity-100 [&>svg:last-child]:hidden')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="shrink-0 opacity-60" />
              <span className="truncate">{label || 'Компанія'}</span>
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 rounded-2xl p-0" align="start">
          <Command>
            <CommandInput placeholder="Знайти або створити…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Компаній поки немає</CommandEmpty>
              <CommandGroup>
                {(value.companyId || value.companyName) && (
                  <CommandItem value="__clear__" onSelect={() => pick({ companyId: null, companyName: '' })}>
                    <X /> Без компанії
                  </CommandItem>
                )}
                {list.map((c) => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => pick({ companyId: c.id, companyName: c.name })}>
                    <Building2 />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.id === value.companyId && <Check />}
                  </CommandItem>
                ))}
                {q && !exact && (
                  <>
                    <CommandItem
                      value={`__create__${q}`}
                      onSelect={async () => {
                        const c = await create.mutateAsync({ name: q })
                        pick({ companyId: c.id, companyName: c.name })
                      }}
                    >
                      <Plus /> Створити картку «{q}»
                    </CommandItem>
                    <CommandItem value={`__text__${q}`} onSelect={() => pick({ companyId: null, companyName: q })}>
                      Просто записати «{q}»
                    </CommandItem>
                  </>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showLink && value.companyId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="soft" size="icon" aria-label="Відкрити компанію" onClick={() => navigate(`/jobs/companies?open=${value.companyId}`)}>
              <ExternalLink />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Картка компанії</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
