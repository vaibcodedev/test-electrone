import { useState } from 'react'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { useNavigate } from 'react-router'
import { Building2, Check, ChevronsUpDown, ExternalLink, Plus, X } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MAX } from '@shared/domain/limits'

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
              <span className="truncate">{label || (readOnly ? '—' : 'Компанія')}</span>
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
