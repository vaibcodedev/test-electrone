import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  Handshake,
  Star,
  Trash2,
  X
} from 'lucide-react'
import { BID_TYPES, PROPOSAL_STATUSES, type Platform, type Proposal, type ProposalPatch } from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Field, SegmentBar, Segmented } from '@/components/common/page'
import { InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { MarkdownField } from '@/components/common/markdown'
import { TagPicker } from '@/components/common/tags'
import { LinksPanel } from '@/components/common/links-panel'
import { PinButtons } from '@/components/common/pin-buttons'
import { Confirm } from '@/components/common/confirm'
import { Choice } from '../crm/parts'
import { BID_TYPE_LABEL, PROPOSAL_STATUS_LABEL } from './proposal-labels'
import { HireDialog } from './hire-dialog'

/** Number input that commits on blur/Enter (null when empty). */
function NumberInput({
  value,
  onCommit,
  placeholder,
  step = 1,
  min = 0,
  max,
  suffix,
  id
}: {
  value: number | null
  onCommit: (value: number | null) => void
  placeholder?: string
  step?: number
  min?: number
  max?: number
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
  const input = (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="tabular-nums"
    />
  )
  if (!suffix) return input
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="tabular-nums"
      />
      <InputGroupAddon align="inline-end">{suffix}</InputGroupAddon>
    </InputGroup>
  )
}

/** Combobox for the task type: suggestions from previous proposals + free text. */
function NicheCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: niches = [] } = useApi('proposals', 'niches', undefined, { enabled: open })
  const q = query.trim()
  const exact = niches.some((n) => n.toLowerCase() === q.toLowerCase())
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="soft" className={cn('w-full justify-between rounded-xl font-normal', !value && 'text-muted-foreground')}>
          {value || 'Next.js, вёрстка, боты…'}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Тип задачи…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Введите новый тип</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => (onChange(''), setOpen(false))}>
                  <X /> Без типа
                </CommandItem>
              )}
              {niches.map((n) => (
                <CommandItem key={n} value={n} onSelect={() => (onChange(n), setOpen(false), setQuery(''))}>
                  {n}
                  {n === value && <Check className="ml-auto" />}
                </CommandItem>
              ))}
              {q && !exact && (
                <CommandItem value={`__new__${q}`} onSelect={() => (onChange(q), setOpen(false), setQuery(''))}>
                  Использовать «{q}»
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function TextField({
  label,
  value,
  onSave,
  placeholder
}: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Field label={label}>
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
    </Field>
  )
}

function PreChecklist({ platform, proposal, patch }: { platform: Platform; proposal: Proposal; patch: (p: ProposalPatch) => void }) {
  if (!platform.preChecklist.length) return null
  const checked = new Set(proposal.checks)
  const done = platform.preChecklist.filter((c) => checked.has(c.id)).length
  const total = platform.preChecklist.length
  const toggle = (id: string, on: boolean): void => {
    const next = new Set(checked)
    if (on) next.add(id)
    else next.delete(id)
    patch({ checks: [...next] })
  }
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel
        action={
          done < total ? (
            <Badge variant="warn">
              <AlertTriangle /> Проверено {done} из {total}
            </Badge>
          ) : (
            <Badge variant="success">
              <Check /> Всё проверено
            </Badge>
          )
        }
      >
        Перед откликом
      </SectionLabel>
      <SegmentBar value={done} total={total} segments={Math.min(total, 8)} />
      <ul className="flex flex-col gap-1.5">
        {platform.preChecklist.map((c) => {
          const id = `check-${proposal.id}-${c.id}`
          return (
            <li key={c.id} className="flex items-start gap-2.5">
              <Checkbox id={id} checked={checked.has(c.id)} onCheckedChange={(v) => toggle(c.id, !!v)} className="mt-0.5" />
              <Label htmlFor={id} className={cn('text-body leading-snug font-normal text-foreground', checked.has(c.id) && 'text-muted-foreground line-through')}>
                {c.label}
              </Label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TemplatePicker({ proposal, patch }: { proposal: Proposal; patch: (p: ProposalPatch) => void }) {
  const { data: templates = [] } = useApi('templates', 'list', { situation: 'proposal' })
  const [selected, setSelected] = useState<string | null>(proposal.templateId)
  const tpl = templates.find((t) => t.id === selected)
  const insert = (): void => {
    if (!tpl) return
    patch({ coverLetter: tpl.body, templateId: tpl.id })
    void api.templates.markCopied(tpl.id)
    toast.success('Шаблон вставлен — замените {переменные}')
  }
  return (
    <div className="flex items-end gap-2">
      <Field label="Шаблон отклика" className="flex-1">
        <Choice
          value={selected}
          onChange={(v) => {
            setSelected(v)
            patch({ templateId: v })
          }}
          none="Без шаблона"
          placeholder="Выберите шаблон"
          options={templates.map((t) => ({ value: t.id, label: t.title }))}
        />
      </Field>
      {proposal.coverLetter.trim() ? (
        <Confirm
          title="Заменить текст отклика?"
          description="Текущий текст будет заменён шаблоном."
          confirmLabel="Заменить"
          onConfirm={insert}
        >
          <Button variant="soft" disabled={!tpl}>
            <FileText /> Вставить
          </Button>
        </Confirm>
      ) : (
        <Button variant="soft" disabled={!tpl} onClick={insert}>
          <FileText /> Вставить
        </Button>
      )}
    </div>
  )
}

function Editor({ proposal: p, platform, onClose }: { proposal: Proposal; platform: Platform; onClose: () => void }) {
  const navigate = useNavigate()
  const update = useApiMutation('proposals', 'update')
  const remove = useApiMutation('proposals', 'remove', { successMessage: 'Отклик в корзине', onSuccess: onClose })
  const toTemplate = useApiMutation('proposals', 'toTemplate', {
    successMessage: 'Шаблон создан',
    onSuccess: (t) => navigate(`/freelance/templates?open=${t.id}`)
  })
  const [hireOpen, setHireOpen] = useState(false)
  const patch = (patchValue: ProposalPatch): void => update.mutate({ id: p.id, patch: patchValue })
  const [title, setTitle] = useAutosave(p.jobTitle, (t) => t.trim() && patch({ jobTitle: t.trim() }))
  const [cover, setCover] = useAutosave(p.coverLetter, (v) => patch({ coverLetter: v }))
  const [description, setDescription] = useAutosave(p.jobDescription, (v) => patch({ jobDescription: v }))
  const [notes, setNotes] = useAutosave(p.notes, (v) => patch({ notes: v }))
  const hasCredits = !!platform.creditsName

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <PinButtons entity={{ type: 'proposal', id: p.id }} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={p.starred}
              onPressedChange={(starred) => patch({ starred })}
              aria-label="Сильный отклик"
              className="size-8 min-w-8 rounded-full bg-surface p-0 on:bg-warn/15 on:text-warn"
            >
              <Star className={cn(p.starred && 'fill-current')} />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Сильный отклик — переиспользовать</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        {p.projectId ? (
          <Button size="sm" variant="soft" onClick={() => navigate(`/projects/${p.projectId}`)}>
            <Handshake /> Открыть контракт
          </Button>
        ) : (
          <Button size="sm" variant="lime" onClick={() => setHireOpen(true)}>
            <Handshake /> Контракт
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="В корзину" onClick={() => remove.mutate(p.id)}>
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>В корзину</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={onClose}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Закрыть · Esc</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <SheetTitle className="sr-only">{p.jobTitle}</SheetTitle>
        <SheetDescription className="sr-only">Редактирование отклика</SheetDescription>
        <InlineTitle value={title} onChange={setTitle} placeholder="Название вакансии" className="text-[24px]" />

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Статус">
            <Choice
              value={p.status}
              onChange={(v) => v && patch({ status: v })}
              options={PROPOSAL_STATUSES.map((s) => ({ value: s, label: PROPOSAL_STATUS_LABEL[s] }))}
            />
          </Field>
          <Field label="Тип задачи">
            <NicheCombobox value={p.niche} onChange={(niche) => patch({ niche })} />
          </Field>
          <Field label="Отправлен">
            <DatePicker withTime value={p.sentAt} onChange={(sentAt) => patch({ sentAt })} placeholder="Не отправлен" />
          </Field>
          <Field label="Ссылка на вакансию">
            <LinkInput value={p.jobUrl} onSave={(jobUrl) => patch({ jobUrl })} />
          </Field>
        </div>

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <SectionLabel>Ставка</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Тип ставки">
              <Segmented
                value={p.bidType}
                onChange={(bidType) => patch({ bidType })}
                options={BID_TYPES.map((t) => ({ value: t, label: BID_TYPE_LABEL[t] }))}
              />
            </Field>
            <Field label={p.bidType === 'hourly' ? 'Ставка в час' : 'Сумма'}>
              <NumberInput value={p.bidAmount} onCommit={(v) => patch({ bidAmount: v ?? 0 })} suffix={platform.currency} />
            </Field>
            <Field label="Комиссия платформы">
              <NumberInput
                value={p.feePercent}
                onCommit={(feePercent) => patch({ feePercent })}
                placeholder={String(platform.defaultFeePercent)}
                max={100}
                suffix="%"
              />
            </Field>
            {hasCredits && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={platform.creditsName}>
                  <NumberInput value={p.credits} onCommit={(v) => patch({ credits: Math.round(v ?? 0) })} />
                </Field>
                <Field label="Буст">
                  <NumberInput value={p.boostCredits} onCommit={(v) => patch({ boostCredits: Math.round(v ?? 0) })} />
                </Field>
              </div>
            )}
          </div>
          {platform.kind === 'upwork' && (
            <p className="text-caption text-muted-foreground">
              Точную комиссию Upwork видно при отклике — запишите её сюда, она перейдёт в контракт.
            </p>
          )}
        </section>

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <SectionLabel>Клиент</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Имя или компания" value={p.clientName} onSave={(clientName) => patch({ clientName })} />
            <TextField label="Страна" value={p.clientCountry} onSave={(clientCountry) => patch({ clientCountry })} />
            <Field label="Рейтинг">
              <NumberInput value={p.clientRating} onCommit={(clientRating) => patch({ clientRating })} step={0.1} max={5} placeholder="4.9" />
            </Field>
            <Field label="Потратил на платформе">
              <NumberInput value={p.clientSpent} onCommit={(clientSpent) => patch({ clientSpent })} suffix={platform.currency} />
            </Field>
            <Field label="Hire rate">
              <NumberInput value={p.clientHireRate} onCommit={(clientHireRate) => patch({ clientHireRate })} max={100} suffix="%" />
            </Field>
            <TextField label="Откликов на вакансию" value={p.proposalsOnJob} onSave={(proposalsOnJob) => patch({ proposalsOnJob })} placeholder="20 to 50" />
          </div>
          <div className="flex items-center gap-2.5">
            <Switch
              id={`verified-${p.id}`}
              checked={!!p.paymentVerified}
              onCheckedChange={(paymentVerified) => patch({ paymentVerified })}
            />
            <Label htmlFor={`verified-${p.id}`} className="text-body font-normal text-foreground">
              Оплата верифицирована
            </Label>
            {p.paymentVerified && <BadgeCheck className="size-4 text-success" />}
          </div>
        </section>

        <Separator className="my-6" />
        <PreChecklist platform={platform} proposal={p} patch={patch} />
        {platform.preChecklist.length > 0 && <Separator className="my-6" />}

        <section className="flex flex-col gap-4">
          <TemplatePicker key={p.id} proposal={p} patch={patch} />
          <MarkdownField label="Текст отклика" value={cover} onChange={setCover} placeholder="Cover letter…" minHeight="200px" />
          <div className="flex gap-2">
            <Button variant="soft" size="sm" disabled={!p.coverLetter.trim() || toTemplate.isPending} onClick={() => toTemplate.mutate(p.id)}>
              <FileText /> Сделать шаблоном
            </Button>
          </div>
          <MarkdownField label="Описание вакансии" value={description} onChange={setDescription} placeholder="Скопируйте описание задачи" minHeight="120px" />
          <Field label="Заметки">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Что важно помнить про этот отклик" className="min-h-20" />
          </Field>
        </section>

        <div className="mt-6 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionLabel>Метки</SectionLabel>
            <TagPicker value={p.tags} onChange={(tagIds) => patch({ tagIds })} />
          </section>
          <LinksPanel entity={{ type: 'proposal', id: p.id }} />
          <div className="text-meta text-muted-foreground">
            Создан {fmtDateTime(p.createdAt)}
            {p.repliedAt && ` · ответили ${fmtDateTime(p.repliedAt)}`}
            {p.hiredAt && ` · контракт ${fmtDateTime(p.hiredAt)}`}
          </div>
        </div>
      </div>
      <HireDialog open={hireOpen} onOpenChange={setHireOpen} proposal={p} platform={platform} />
    </div>
  )
}

function LinkInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useAutosave(value, onSave)
  const valid = /^https?:\/\//i.test(draft)
  return (
    <InputGroup>
      <InputGroupInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://…" />
      {valid && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" className="rounded-full" aria-label="Открыть вакансию" onClick={() => void api.app.openExternal(draft)}>
            <ExternalLink />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

/** Right-side proposal editor, opened by ?open=<id>. */
export function ProposalEditorSheet({
  proposalId,
  platform,
  onClose
}: {
  proposalId: string | null
  platform: Platform
  onClose: () => void
}) {
  const { data: proposal } = useApi('proposals', 'get', proposalId ?? '', { enabled: !!proposalId })
  return (
    <Sheet open={!!proposalId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-[640px]">
        {proposal && proposal.id === proposalId ? (
          <Editor key={proposal.id} proposal={proposal} platform={platform} onClose={onClose} />
        ) : (
          <>
            <SheetTitle className="sr-only">Отклик</SheetTitle>
            <SheetDescription className="sr-only">Загрузка</SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
