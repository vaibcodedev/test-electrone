import { useState, type ReactElement } from 'react'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { useNavigate } from 'react-router'
import { ArrowRight, Briefcase, Building2, Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Combobox } from '@/components/common/combobox'
import { MAX } from '@shared/domain/limits'

/**
 * View mode value of a linked record: a link (docs/design-system.md → Кнопки) that opens it. The wrapper takes
 * the Field's `[&>*]:w-full`, so the button stays as wide as its text (no focus ring or click area across the
 * row); a long name ends with «…» inside its own span — truncate on the inline-flex button cut it mid-word.
 */
function RecordLink({ label, onClick }: { label: string; onClick: () => void }): ReactElement {
  return (
    <div className="flex min-w-0">
      <Button variant="link" title={label} className="min-w-0 max-w-full justify-start text-body" onClick={onClick}>
        <span className="truncate">{label}</span>
      </Button>
    </div>
  )
}

const MissingRecord = ({ children }: { children: string }): ReactElement => (
  <span className="text-body text-muted-foreground">{children}</span>
)

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
}): ReactElement {
  // View mode: a link to the company card (or plain text), no picker — it would change the record outside «Редагувати».
  const readOnly = useReadOnly()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Server search, 30 at a time (the companies list can grow without bound).
  const debounced = useDebounced(query.trim())
  const { data: list = [] } = useApi('jobs', 'companies', { search: debounced || undefined, limit: 30 }, { enabled: open })
  const { data: selected, isLoading } = useApi('jobs', 'company', value.companyId ?? '', { enabled: !!value.companyId })
  const create = useApiMutation('jobs', 'createCompany')
  const current = selected ?? (value.companyId ? list.find((c) => c.id === value.companyId) : undefined)
  const label = current?.name ?? value.companyName
  // The linked card is gone (trash or deleted) and no name was stored with the link (a question keeps only the id).
  const gone = !!value.companyId && !isLoading && !current && !value.companyName
  const q = query.trim()
  const exact = list.some((c) => c.name.toLowerCase() === q.toLowerCase())

  const pick = (next: CompanyValue): void => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  if (readOnly) {
    // Still loading and no stored name to show yet: a line of the same height, so the field doesn't pop in later.
    if (isLoading && !label) return <MissingRecord>…</MissingRecord>
    if (gone) return <MissingRecord>Компанія в кошику або видалена</MissingRecord>
    // The root is the Field's direct child, so an empty value hides the whole field.
    if (!label) return <div data-empty />
    // Free text, or a card that is gone but whose name the record still keeps: plain text, nothing to open.
    if (!value.companyId || (!isLoading && !current))
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
          <Button variant="field" aria-expanded={open} className={cn('min-w-0 flex-1 justify-between', !label && 'text-muted-foreground')}>
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="shrink-0 text-muted-foreground" />
              <span className="truncate">{label || (gone ? 'Компанія в кошику або видалена' : 'Компанія')}</span>
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
            <Button variant="soft" size="icon" aria-label="Відкрити картку компанії" onClick={() => navigate(`/jobs/companies?open=${value.companyId}`)}>
              <ArrowRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Відкрити картку компанії</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

const GONE_APPLICATION = 'Вакансія в кошику або видалена'
const applicationLabel = (a: { title: string; company: string }): string => (a.company ? `${a.title} — ${a.company}` : a.title)

/**
 * Vacancy combobox (server search, 30 at a time): links a record — e.g. an interview question — to a vacancy.
 * View mode shows a link to the vacancy, or nothing when none is set.
 */
export function ApplicationCombobox({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }): ReactElement {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim())
  const { data: list = [], isFetching } = useApi('jobs', 'list', { search: debounced || undefined, limit: 30, offset: 0 }, { enabled: open })
  const { data: selected, isLoading } = useApi('jobs', 'get', value ?? '', { enabled: !!value })
  const label = selected && selected.id === value ? applicationLabel(selected) : ''
  // The link points at a vacancy that is gone (trash or deleted): say so instead of looking unset.
  const gone = !!value && !isLoading && !label
  return (
    <Combobox
      value={value}
      options={list.map((a) => ({ value: a.id, label: applicationLabel(a) }))}
      onChange={onChange}
      icon={Briefcase}
      placeholder="Вакансія"
      searchPlaceholder="Посада або компанія…"
      emptyText="Вакансій не знайдено"
      clearable
      clearLabel="Без вакансії"
      maxLength={200}
      onOpenChange={setOpen}
      onSearchChange={setQuery}
      loading={isFetching || query.trim() !== debounced}
      // «…» while loading keeps the field's line, so it doesn't pop in and push the form down.
      selectedLabel={isLoading ? '…' : gone ? GONE_APPLICATION : label}
      renderView={(o) =>
        isLoading || gone ? (
          <MissingRecord>{o.label}</MissingRecord>
        ) : (
          <RecordLink label={o.label} onClick={() => navigate(`/jobs/applications?open=${o.value}`)} />
        )
      }
    />
  )
}
