import { useState, type ReactElement } from 'react'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { useNavigate } from 'react-router'
import { Briefcase, Building2, Check, ChevronsUpDown, ExternalLink, Plus, X } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MAX } from '@shared/domain/limits'

/**
 * View mode value of a linked record: a link-title (docs/design-system.md → Кнопки) that opens it. As wide as
 * its text (no focus ring across the whole row); a long name ends with «…» inside its own span — truncate on
 * the inline-flex button cut it mid-word.
 */
function RecordLink({ label, onClick }: { label: string; onClick: () => void }): ReactElement {
  return (
    <Button
      variant="link"
      className="max-w-full min-w-0 self-start justify-start text-body no-underline hover:underline"
      title={label}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
    </Button>
  )
}

/** Picker trigger that looks like an input (the same border and tint as `Input`), not like a button. */
export const PICKER_TRIGGER =
  'w-full justify-between rounded-xl border border-input bg-foreground/[0.04] font-normal hover:border-foreground/40 hover:bg-foreground/[0.04]'

export interface CompanyValue {
  companyId: string | null
  companyName: string
}

/**
 * Company combobox: pick an existing company card, create one from the typed name,
 * or keep it as free text (`allowText`). Shows a link to the company card when one is linked.
 */
export function CompanyCombobox({
  value,
  onChange,
  showLink = true,
  allowText = true
}: {
  value: CompanyValue
  onChange: (value: CompanyValue) => void
  showLink?: boolean
  /** false — only a company card can be chosen (a question stores just companyId). */
  allowText?: boolean
}) {
  // View mode: a link to the company card (or plain text), no picker — it would change the record outside «Редагувати».
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

  if (readOnly) {
    // The root is the Field's direct child, so an empty value hides the whole field.
    if (!label) return <div data-empty />
    if (!value.companyId)
      return (
        <span className="block truncate text-body" title={label}>
          {label}
        </span>
      )
    return <RecordLink label={label} onClick={() => navigate(`/jobs/companies?open=${value.companyId}`)} />
  }

  return (
    <div className="flex gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        {/* Stays a button role (no role="combobox"): e2e flows2-jobs finds it as the «Компанія» button. */}
        <PopoverTrigger asChild>
          <Button variant="soft" aria-expanded={open} className={cn(PICKER_TRIGGER, 'min-w-0 flex-1', !label && 'text-muted-foreground')}>
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="shrink-0 text-muted-foreground" />
              <span className="truncate">{label || 'Компанія'}</span>
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 rounded-2xl p-0" align="start">
          <Command>
            <CommandInput placeholder="Знайти або створити…" value={query} onValueChange={setQuery} maxLength={MAX.name} />
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
                      disabled={create.isPending}
                      onSelect={() => {
                        if (create.isPending) return
                        create.mutate({ name: q }, { onSuccess: (c) => pick({ companyId: c.id, companyName: c.name }) })
                      }}
                    >
                      <Plus /> Створити картку «{q}»
                    </CommandItem>
                    {allowText && (
                      <CommandItem value={`__text__${q}`} onSelect={() => pick({ companyId: null, companyName: q })}>
                        Просто записати «{q}»
                      </CommandItem>
                    )}
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

/**
 * Vacancy combobox (server search, 30 at a time): links a record — e.g. an interview question — to a vacancy.
 * View mode shows a link to the vacancy, or nothing when none is set.
 */
export function ApplicationCombobox({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }): ReactElement {
  const readOnly = useReadOnly()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim())
  const { data: list = [] } = useApi('jobs', 'list', { search: debounced || undefined, limit: 30, offset: 0 }, { enabled: open })
  const { data: selected, isLoading } = useApi('jobs', 'get', value ?? '', { enabled: !!value })
  const labelOf = (a: { title: string; company: string }): string => (a.company ? `${a.title} — ${a.company}` : a.title)
  const label = selected && selected.id === value ? labelOf(selected) : ''
  // The link points at a vacancy that is gone (trash or deleted): say so instead of looking unset.
  const gone = !!value && !isLoading && !label

  const pick = (id: string | null): void => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  if (readOnly) {
    if (!value) return <div data-empty />
    // Still loading: a line of the same height, so the field doesn't pop in and push the form down.
    if (isLoading) return <span className="text-body text-muted-foreground">…</span>
    if (gone) return <span className="text-body text-muted-foreground">Вакансію видалено</span>
    return <RecordLink label={label} onClick={() => navigate(`/jobs/applications?open=${value}`)} />
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="soft"
          role="combobox"
          aria-expanded={open}
          className={cn(PICKER_TRIGGER, 'min-w-0', !label && 'text-muted-foreground')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Briefcase className="shrink-0 text-muted-foreground" />
            <span className="truncate">{label || (gone ? 'Вакансію видалено' : 'Вакансія')}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 rounded-2xl p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Посада або компанія…" value={query} onValueChange={setQuery} maxLength={200} />
          <CommandList>
            <CommandEmpty>Вакансій не знайдено</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => pick(null)}>
                  <X /> Без вакансії
                </CommandItem>
              )}
              {list.map((a) => (
                <CommandItem key={a.id} value={a.id} onSelect={() => pick(a.id)}>
                  <Briefcase />
                  <span className="flex-1 truncate">{labelOf(a)}</span>
                  {a.id === value && <Check />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
