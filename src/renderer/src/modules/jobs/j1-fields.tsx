import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Building2, Check, ChevronsUpDown, ExternalLink, Plus, X } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
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
  className
}: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Field label={label} className={className}>
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
    </Field>
  )
}

/** URL input with an «open in browser» button. */
export function LinkInput({ value, onSave, placeholder = 'https://…' }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useAutosave(value, onSave)
  const valid = /^https?:\/\//i.test(draft)
  return (
    <InputGroup>
      <InputGroupInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
      {valid && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" className="rounded-full" aria-label="Открыть ссылку" onClick={() => void api.app.openExternal(draft)}>
            <ExternalLink />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
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
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: list = [] } = useApi('jobs', 'companies', undefined)
  const create = useApiMutation('jobs', 'createCompany')
  const current = value.companyId ? list.find((c) => c.id === value.companyId) : undefined
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
          <Button variant="soft" className={cn('min-w-0 flex-1 justify-between rounded-xl font-normal', !label && 'text-muted-foreground')}>
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="shrink-0 opacity-60" />
              <span className="truncate">{label || 'Компания'}</span>
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 rounded-2xl p-0" align="start">
          <Command>
            <CommandInput placeholder="Найти или создать…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Компаний пока нет</CommandEmpty>
              <CommandGroup>
                {(value.companyId || value.companyName) && (
                  <CommandItem value="__clear__" onSelect={() => pick({ companyId: null, companyName: '' })}>
                    <X /> Без компании
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
                      <Plus /> Создать карточку «{q}»
                    </CommandItem>
                    <CommandItem value={`__text__${q}`} onSelect={() => pick({ companyId: null, companyName: q })}>
                      Просто записать «{q}»
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
            <Button variant="soft" size="icon" aria-label="Открыть компанию" onClick={() => navigate(`/jobs/companies?open=${value.companyId}`)}>
              <ExternalLink />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Карточка компании</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
