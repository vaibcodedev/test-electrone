import { useState, type RefObject } from 'react'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  Award,
  BadgeCheck,
  Check,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  Handshake,
  Trash2,
  X
} from 'lucide-react'
import {
  BID_TYPES,
  PROPOSAL_STATUSES,
  proposalInputSchema,
  type Platform,
  type Proposal,
  type ProposalPatch
} from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import {
  EditToggle,
  guardSheet,
  RecordMode,
  useModeRef,
  usePublishMode,
  useRecordMode,
  type DetailMode
} from '@/components/common/detail-mode'
import { isLikelyUrl, limitsOf, rangesOf, URL_ERROR } from '@/lib/limits'
import { NumberField } from '../crm/number-field'
import { CountryCombobox } from '../crm/country-combobox'
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
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

const PROPOSAL_L = limitsOf(proposalInputSchema)
const R = rangesOf(proposalInputSchema)

/** Number input that commits on blur/Enter (null when empty). */
/** Combobox for the task type: suggestions from previous proposals + free text. */
function NicheCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // View mode: the value as plain text, no picker (it would change the record outside «Редагувати»).
  const readOnly = useReadOnly()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: niches = [] } = useApi('proposals', 'niches', undefined, { enabled: open })
  const q = query.trim()
  const exact = niches.some((n) => n.toLowerCase() === q.toLowerCase())
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="soft"
          disabled={readOnly}
          className={cn(
            'w-full justify-between rounded-xl font-normal',
            !value && 'text-muted-foreground',
            readOnly && 'pointer-events-none bg-transparent px-0 shadow-none disabled:opacity-100 [&>svg:last-child]:hidden'
          )}
        >
          {value || 'Next.js, верстка, боти…'}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Тип завдання…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Введіть новий тип</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => (onChange(''), setOpen(false))}>
                  <X /> Без типу
                </CommandItem>
              )}
              {niches.map((n) => (
                <CommandItem
                  key={n}
                  value={n}
                  onSelect={() => (onChange(n), setOpen(false), setQuery(''))}
                >
                  {n}
                  {n === value && <Check className="ml-auto" />}
                </CommandItem>
              ))}
              {q && !exact && (
                <CommandItem
                  value={`__new__${q}`}
                  onSelect={() => (onChange(q), setOpen(false), setQuery(''))}
                >
                  Використати «{q}»
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
  placeholder,
  maxLength
}: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  const [draft, setDraft] = useAutosave(value, onSave)
  return (
    <Field label={label}>
      <Input
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  )
}

function PreChecklist({
  platform,
  proposal,
  patch
}: {
  platform: Platform
  proposal: Proposal
  patch: (p: ProposalPatch) => void
}) {
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
            <Badge variant="soft" className="tabular-nums">
              {done} з {total}
            </Badge>
          ) : (
            <Badge variant="success">
              <Check /> Усе перевірено
            </Badge>
          )
        }
      >
        Перед відгуком
      </SectionLabel>
      {/* One segment per item, filled where that item is done — not "first N". */}
      <SegmentBar
        value={done}
        total={total}
        states={platform.preChecklist.map((c) => checked.has(c.id))}
      />
      <ul className="flex flex-col gap-1.5">
        {platform.preChecklist.map((c) => {
          const id = `check-${proposal.id}-${c.id}`
          return (
            <li key={c.id} className="flex items-start gap-2.5">
              <Checkbox
                id={id}
                checked={checked.has(c.id)}
                onCheckedChange={(v) => toggle(c.id, !!v)}
                className="mt-0.5"
              />
              <Label
                htmlFor={id}
                className={cn(
                  'text-body leading-snug font-normal text-foreground',
                  checked.has(c.id) && 'text-muted-foreground'
                )}
              >
                {c.label}
              </Label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TemplatePicker({
  proposal,
  patch
}: {
  proposal: Proposal
  patch: (p: ProposalPatch) => void
}) {
  const { data: templates = [] } = useApi('templates', 'list', { situation: 'proposal' })
  const [selected, setSelected] = useState<string | null>(proposal.templateId)
  const tpl = templates.find((t) => t.id === selected)
  const insert = (): void => {
    if (!tpl) return
    patch({ coverLetter: tpl.body, templateId: tpl.id })
    void api.templates.markCopied(tpl.id)
    toast.success('Шаблон вставлено — замініть {змінні}')
  }
  return (
    <div className="flex items-end gap-2">
      <Field label="Шаблон відгуку" className="flex-1">
        <Choice
          value={selected}
          onChange={(v) => {
            setSelected(v)
            patch({ templateId: v })
          }}
          none="Без шаблону"
          placeholder="Оберіть шаблон"
          options={templates.map((t) => ({ value: t.id, label: t.title }))}
        />
      </Field>
      {proposal.coverLetter.trim() ? (
        <Confirm
          title="Замінити текст відгуку?"
          description="Поточний текст буде замінено шаблоном."
          confirmLabel="Замінити"
          onConfirm={insert}
        >
          <Button variant="soft" disabled={!tpl}>
            <FileText /> Вставити
          </Button>
        </Confirm>
      ) : (
        <Button variant="soft" disabled={!tpl} onClick={insert}>
          <FileText /> Вставити
        </Button>
      )}
    </div>
  )
}

function Editor({
  proposal: p,
  platform,
  onClose,
  modeRef
}: {
  proposal: Proposal
  platform: Platform
  onClose: () => void
  modeRef?: RefObject<DetailMode | null>
}) {
  const navigate = useNavigate()
  const update = useApiMutation('proposals', 'update')
  const remove = useApiMutation('proposals', 'remove', {
    successMessage: 'Відгук переміщено в кошик',
    onSuccess: onClose
  })
  const toTemplate = useApiMutation('proposals', 'toTemplate', {
    successMessage: 'Шаблон створено',
    onSuccess: (t) => navigate(`/freelance/templates?open=${t.id}`)
  })
  const [hireOpen, setHireOpen] = useState(false)
  const patch = (patchValue: ProposalPatch): void => update.mutate({ id: p.id, patch: patchValue })
  const [title, setTitle] = useAutosave(
    p.jobTitle,
    (t) => t.trim() && patch({ jobTitle: t.trim() })
  )
  const [cover, setCover] = useAutosave(p.coverLetter, (v) => patch({ coverLetter: v }))
  const [description, setDescription] = useAutosave(p.jobDescription, (v) =>
    patch({ jobDescription: v })
  )
  const [notes, setNotes] = useAutosave(p.notes, (v) => patch({ notes: v }))
  const hasCredits = !!platform.creditsName
  // Click opens the proposal for reading; «Редагувати» switches it to editing.
  const mode = useRecordMode(p.id, 'proposal')
  usePublishMode(modeRef, mode)

  return (
    <RecordMode mode={mode}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <EditToggle mode={mode} onClose={onClose} />
          <PinButtons entity={{ type: 'proposal', id: p.id }} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={p.starred}
                onPressedChange={(starred) => patch({ starred })}
                aria-label="Сильний відгук"
                className="h-8 gap-1.5 rounded-full bg-surface px-3 text-caption on:bg-warn/15 on:text-warn"
              >
                <Award /> Сильний
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Сильний відгук — використати ще раз</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          {p.projectId ? (
            <Button size="sm" variant="soft" onClick={() => navigate(`/projects/${p.projectId}`)}>
              <Handshake /> Відкрити контракт
            </Button>
          ) : (
            <Button size="sm" variant="lime" onClick={() => setHireOpen(true)}>
              <Handshake /> Контракт
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                data-edit-only
                aria-label="У кошик"
                onClick={() => remove.mutate(p.id)}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>У кошик</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Закрити" onClick={() => (mode.confirmClose ? mode.confirmClose(onClose) : onClose())}>
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Закрити · Esc</TooltipContent>
          </Tooltip>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <SheetTitle className="sr-only">{p.jobTitle}</SheetTitle>
          <SheetDescription className="sr-only">Редагування відгуку</SheetDescription>
          <InlineTitle
            value={title}
            onChange={setTitle}
            maxLength={PROPOSAL_L.jobTitle}
            placeholder="Назва вакансії"
            className="text-[24px]"
          />

          <div className="mt-5 grid grid-cols-2 gap-4">
            <Field label="Статус">
              <Choice
                value={p.status}
                onChange={(v) => v && patch({ status: v })}
                options={PROPOSAL_STATUSES.map((s) => ({
                  value: s,
                  label: PROPOSAL_STATUS_LABEL[s]
                }))}
              />
            </Field>
            <Field label="Тип завдання">
              <NicheCombobox value={p.niche} onChange={(niche) => patch({ niche })} />
            </Field>
            <Field label="Надіслано">
              <DatePicker
                withTime
                value={p.sentAt}
                onChange={(sentAt) => patch({ sentAt })}
                placeholder="Не надіслано"
              />
            </Field>
            <LinkInput value={p.jobUrl} onSave={(jobUrl) => patch({ jobUrl })} />
          </div>

          <Separator className="my-6" />

          <section className="flex flex-col gap-4">
            <SectionLabel>Ставка</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Тип ставки">
                <Segmented
                  className="w-fit"
                  value={p.bidType}
                  onChange={(bidType) => patch({ bidType })}
                  options={BID_TYPES.map((t) => ({ value: t, label: BID_TYPE_LABEL[t] }))}
                />
              </Field>
              <NumberField
                label={p.bidType === 'hourly' ? 'Ставка за годину' : 'Сума'}
                value={p.bidAmount}
                {...R.bidAmount}
                onCommit={(v) => patch({ bidAmount: v ?? 0 })}
                unit={platform.currency}
              />
              <NumberField
                label="Комісія платформи"
                value={p.feePercent}
                {...R.feePercent}
                step={0.5}
                onCommit={(feePercent) => patch({ feePercent })}
                placeholder={String(platform.defaultFeePercent)}
                unit="%"
              />
              {hasCredits && (
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={platform.creditsName}
                    integer
                    value={p.credits}
                    {...R.credits}
                    onCommit={(v) => patch({ credits: v ?? 0 })}
                  />
                  <NumberField
                    label="Буст"
                    integer
                    value={p.boostCredits}
                    {...R.boostCredits}
                    onCommit={(v) => patch({ boostCredits: v ?? 0 })}
                  />
                </div>
              )}
            </div>
            {platform.kind === 'upwork' && (
              <p className="text-caption text-muted-foreground">
                Точну комісію Upwork видно під час відгуку — запишіть її сюди, вона перейде в
                контракт.
              </p>
            )}
          </section>

          <Separator className="my-6" />

          <section className="flex flex-col gap-4">
            <SectionLabel>Клієнт</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Ім’я або компанія"
                maxLength={PROPOSAL_L.clientName}
                value={p.clientName}
                onSave={(clientName) => patch({ clientName })}
              />
              <Field label="Країна">
                <CountryCombobox
                  value={p.clientCountry}
                  onChange={(clientCountry) => patch({ clientCountry })}
                />
              </Field>
              <NumberField
                label="Рейтинг"
                value={p.clientRating}
                {...R.clientRating}
                step={0.1}
                onCommit={(clientRating) => patch({ clientRating })}
                placeholder="4.9"
                unit="★"
              />
              <NumberField
                label="Витрачено"
                value={p.clientSpent}
                {...R.clientSpent}
                onCommit={(clientSpent) => patch({ clientSpent })}
                unit={platform.currency}
              />
              <NumberField
                label="Найм, %"
                value={p.clientHireRate}
                {...R.clientHireRate}
                onCommit={(clientHireRate) => patch({ clientHireRate })}
                unit="%"
              />
              <TextField
                label="Відгуків на вакансію"
                maxLength={PROPOSAL_L.proposalsOnJob}
                value={p.proposalsOnJob}
                onSave={(proposalsOnJob) => patch({ proposalsOnJob })}
                placeholder="20 to 50"
              />
            </div>
            <div className="flex items-center gap-2.5">
              <Switch
                id={`verified-${p.id}`}
                checked={!!p.paymentVerified}
                onCheckedChange={(paymentVerified) => patch({ paymentVerified })}
              />
              <Label htmlFor={`verified-${p.id}`} className="text-body font-normal text-foreground">
                Оплату верифіковано
              </Label>
              {p.paymentVerified && <BadgeCheck className="size-4 text-success" />}
            </div>
          </section>

          <Separator className="my-6" />
          <PreChecklist platform={platform} proposal={p} patch={patch} />
          {platform.preChecklist.length > 0 && <Separator className="my-6" />}

          <section className="flex flex-col gap-4">
            <div data-edit-only>
              <TemplatePicker key={p.id} proposal={p} patch={patch} />
            </div>
            <MarkdownField
              label="Текст відгуку"
              value={cover}
              onChange={setCover}
              placeholder="Cover letter…"
              minHeight="200px"
            />
            <div className="flex gap-2" data-edit-only>
              <Button
                variant="soft"
                size="sm"
                disabled={!p.coverLetter.trim() || toTemplate.isPending}
                onClick={() => toTemplate.mutate(p.id)}
              >
                <FileText /> Зробити шаблоном
              </Button>
            </div>
            <MarkdownField
              label="Опис вакансії"
              value={description}
              onChange={setDescription}
              placeholder="Скопіюйте опис завдання"
              minHeight="120px"
            />
            <Field label="Нотатки" count={{ length: notes.length, max: PROPOSAL_L.notes }}>
              <Textarea
                value={notes}
                maxLength={PROPOSAL_L.notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Що важливо пам’ятати про цей відгук"
                className="min-h-20"
              />
            </Field>
          </section>

          <div className="mt-6 flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <SectionLabel>Мітки</SectionLabel>
              <TagPicker value={p.tags} onChange={(tagIds) => patch({ tagIds })} />
            </section>
            <LinksPanel entity={{ type: 'proposal', id: p.id }} />
            <div className="text-meta text-muted-foreground">
              Створено {fmtDateTime(p.createdAt)}
              {p.repliedAt && ` · відповіли ${fmtDateTime(p.repliedAt)}`}
              {p.hiredAt && ` · контракт ${fmtDateTime(p.hiredAt)}`}
            </div>
          </div>
        </div>
        {/* Mounted per opening: the form takes the proposal as it is now, not as it was when the editor opened. */}
        {hireOpen && <HireDialog open onOpenChange={setHireOpen} proposal={p} platform={platform} />}
      </div>
    </RecordMode>
  )
}

/** Job link: an invalid non-empty value is shown as an error and never saved. */
function LinkInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useAutosave(value, (v) => {
    if (isLikelyUrl(v)) onSave(v.trim())
  })
  const bad = !isLikelyUrl(draft)
  const valid = !bad && /^https?:\/\//i.test(draft)
  return (
    <Field label="Посилання на вакансію" error={bad ? URL_ERROR : undefined}>
      <InputGroup>
        <InputGroupInput
          type="url"
          value={draft}
          maxLength={PROPOSAL_L.jobUrl}
          aria-invalid={bad || undefined}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://…"
        />
        {valid && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              className="rounded-full"
              aria-label="Відкрити вакансію"
              onClick={() => void api.app.openExternal(draft)}
            >
              <ExternalLink />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    </Field>
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
  const modeRef = useModeRef()
  const guard = guardSheet(modeRef, onClose)
  return (
    <Sheet open={!!proposalId} onOpenChange={guard.onOpenChange}>
      <SheetContent
        onEscapeKeyDown={guard.onEscapeKeyDown}
        side="right"
        showCloseButton={false}
        className="w-full gap-0 p-0 sm:max-w-[640px]"
      >
        {proposal && proposal.id === proposalId ? (
          <Editor key={proposal.id} proposal={proposal} platform={platform} onClose={onClose} modeRef={modeRef} />
        ) : (
          <>
            <SheetTitle className="sr-only">Відгук</SheetTitle>
            <SheetDescription className="sr-only">Завантаження</SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
