import { useEffect, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { FileText, Trash2, X } from 'lucide-react'
import { APPLICATION_STATUSES, WORK_FORMATS, applicationInputSchema, type ApplicationDetails, type ApplicationPatch } from '@shared/domain/jobs'
import { limitsOf, rangesOf } from '@/lib/limits'
import { NumberInput } from '@/components/common/number-input'

const LIMITS = limitsOf(applicationInputSchema)
const RANGES = rangesOf(applicationInputSchema)
import { CURRENCIES } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Field, Segmented } from '@/components/common/page'
import { InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { MarkdownField } from '@/components/common/markdown'
import { TagPicker } from '@/components/common/tags'
import { LinksPanel } from '@/components/common/links-panel'
import { AttachmentsPanel } from '@/components/common/attachments'
import { PinButtons } from '@/components/common/pin-buttons'
import { promptAfterStatusChange } from './schedule-stage'
import {
  EditToggle,
  guardSheet,
  RecordMode,
  useModeRef,
  usePublishMode,
  useRecordMode,
  type DetailMode
} from '@/components/common/detail-mode'
import { Confirm } from '@/components/common/confirm'
import { Choice } from '../crm/parts'
import { CompanyCombobox, LinkInput, TextField } from './j1-fields'
import { APP_STATUS_LABEL, FORMAT_LABEL } from './j1-labels'
import { StageSection } from './stage-section'
import { AskedQuestions } from './application-questions'

/**
 * Salary «від … до …». The pair is saved only when it makes sense: «від» above «до» stays in the
 * fields with an error under «до» and isn't saved until one of them is fixed.
 */
function SalaryFields({
  min,
  max,
  patch
}: {
  min: number | null
  max: number | null
  patch: (p: ApplicationPatch) => void
}) {
  const [draft, setDraft] = useState({ min, max })
  useEffect(() => setDraft({ min, max }), [min, max])
  const inverted = draft.min !== null && draft.max !== null && draft.min > draft.max
  const commit = (next: { min: number | null; max: number | null }): void => {
    setDraft(next)
    if (next.min !== null && next.max !== null && next.min > next.max) return
    const p: ApplicationPatch = {}
    if (next.min !== min) p.salaryMin = next.min
    if (next.max !== max) p.salaryMax = next.max
    if (Object.keys(p).length) patch(p)
  }
  return (
    <>
      <Field label="Зарплата від">
        <NumberInput
          allowEmpty
          integer
          {...RANGES.salaryMin}
          value={draft.min}
          aria-invalid={inverted || undefined}
          onChange={(v) => commit({ ...draft, min: v })}
        />
      </Field>
      <Field label="до" error={inverted ? '«До» менше, ніж «від»' : undefined}>
        <NumberInput
          allowEmpty
          integer
          {...RANGES.salaryMax}
          value={draft.max}
          aria-invalid={inverted || undefined}
          onChange={(v) => commit({ ...draft, max: v })}
        />
      </Field>
    </>
  )
}

function CoverTemplatePicker({ application: a, patch }: { application: ApplicationDetails; patch: (p: ApplicationPatch) => void }) {
  const { data: letters = [] } = useApi('templates', 'list', { situation: 'cover_letter' })
  const [selected, setSelected] = useState<string | null>(a.templateId)
  const tpl = letters.find((t) => t.id === selected)
  const insert = (): void => {
    if (!tpl) return
    patch({ coverLetter: tpl.body, templateId: tpl.id })
    void api.templates.markCopied(tpl.id)
    toast.success('Шаблон вставлено — замініть {змінні}')
  }
  const button = (
    <Button variant="soft" disabled={!tpl}>
      <FileText /> Вставити
    </Button>
  )
  return (
    <div className="flex items-end gap-2">
      <Field label="Шаблон супровідного листа" className="flex-1">
        <Choice
          value={selected}
          onChange={(v) => {
            setSelected(v)
            patch({ templateId: v })
          }}
          none="Без шаблону"
          placeholder={letters.length ? 'Виберіть шаблон' : 'Шаблонів поки немає'}
          options={letters.map((t) => ({ value: t.id, label: t.title }))}
        />
      </Field>
      {a.coverLetter.trim() ? (
        <Confirm title="Замінити текст листа?" description="Поточний текст буде замінено шаблоном." confirmLabel="Замінити" onConfirm={insert}>
          {button}
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
  application: a,
  onClose,
  modeRef
}: {
  application: ApplicationDetails
  onClose: () => void
  modeRef?: RefObject<DetailMode | null>
}) {
  const update = useApiMutation('jobs', 'update')
  const remove = useApiMutation('jobs', 'remove', { successMessage: 'Вакансію переміщено в кошик', onSuccess: onClose })
  const { data: boards = [] } = useApi('jobs', 'boards', { includeInactive: true })
  const { data: resumes = [] } = useApi('jobs', 'resumes')
  const patch = (p: ApplicationPatch): void => update.mutate({ id: a.id, patch: p })
  const [title, setTitle] = useAutosave(a.title, (t) => t.trim() && patch({ title: t.trim() }))
  const [cover, setCover] = useAutosave(a.coverLetter, (v) => patch({ coverLetter: v }))
  const [description, setDescription] = useAutosave(a.description, (v) => patch({ description: v }))
  const [notes, setNotes] = useAutosave(a.notes, (v) => patch({ notes: v }))
  const [contact, setContact] = useAutosave(a.contact, (v) => patch({ contact: v }))

  const mode = useRecordMode(a.id, 'application')
  usePublishMode(modeRef, mode)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <PinButtons entity={{ type: 'application', id: a.id }} />
        <div className="flex-1" />
        <EditToggle mode={mode} onClose={onClose} />
        <Choice
          size="sm"
          value={a.status}
          onChange={(v) => {
            if (!v) return
            patch({ status: v })
            promptAfterStatusChange(a, v)
          }}
          options={APPLICATION_STATUSES.map((s) => ({ value: s, label: APP_STATUS_LABEL[s] }))}
          className="w-44"
        />
        <Confirm title="Перемістити вакансію в кошик?" description="Пов’язані події календаря теж потраплять у кошик." confirmLabel="У кошик" onConfirm={() => remove.mutate(a.id)}>
          <Button variant="ghost" size="icon-sm" aria-label="У кошик">
            <Trash2 />
          </Button>
        </Confirm>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Закрити" onClick={() => (mode.confirmClose ? mode.confirmClose(onClose) : onClose())}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Закрити · Esc</TooltipContent>
        </Tooltip>
      </div>

      <RecordMode mode={mode}>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <SheetTitle className="sr-only">{a.title}</SheetTitle>
        <SheetDescription className="sr-only">Редагування вакансії</SheetDescription>
        <InlineTitle value={title} onChange={setTitle} placeholder="Посада" className="text-headline" maxLength={LIMITS.title} />

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Компанія" className="col-span-2">
            <CompanyCombobox
              value={{ companyId: a.companyId, companyName: a.companyName }}
              onChange={({ companyId, companyName }) => patch({ companyId, companyName })}
            />
          </Field>
          <Field label="Майданчик">
            <Choice
              value={a.boardId}
              onChange={(boardId) => patch({ boardId })}
              none="Не вказано"
              options={boards.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Field>
          <Field label="Посилання на вакансію">
            <LinkInput value={a.url} onSave={(url) => patch({ url })} />
          </Field>
          <Field label="Надіслано">
            <DatePicker value={a.appliedAt} onChange={(appliedAt) => patch({ appliedAt })} placeholder="Ще не надіслано" />
          </Field>
          <Field label="Нагадати про себе">
            <DatePicker value={a.followUpAt} onChange={(followUpAt) => patch({ followUpAt })} placeholder="Не нагадувати" />
          </Field>
        </div>

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <SectionLabel>Умови</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <SalaryFields min={a.salaryMin} max={a.salaryMax} patch={patch} />
            <Field label="Валюта">
              <Choice value={a.currency} onChange={(v) => v && patch({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Формат">
              <Segmented
                value={a.format}
                onChange={(format) => patch({ format })}
                options={WORK_FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
              />
            </Field>
            <TextField
              label="Місто / часовий пояс"
              value={a.location}
              onSave={(location) => patch({ location })}
              placeholder="Київ, EU timezone…"
              maxLength={LIMITS.location}
            />
          </div>
        </section>

        <Separator className="my-6" />

        <StageSection applicationId={a.id} stages={a.stages} />

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <SectionLabel>Що надіслав</SectionLabel>
          <Field label="Версія резюме">
            <Choice
              value={a.resumeId}
              onChange={(resumeId) => patch({ resumeId })}
              none="Не вказано"
              placeholder={resumes.length ? 'Виберіть версію' : 'Завантажте резюме в розділі «Резюме»'}
              options={resumes.map((r) => ({
                value: r.id,
                label: `${r.title}${r.isCurrent ? ' · поточна' : ''} — ${fmtDate(r.createdAt, 'd MMM')}`
              }))}
            />
          </Field>
          <CoverTemplatePicker key={a.id} application={a} patch={patch} />
          <MarkdownField label="Супровідний лист" value={cover} onChange={setCover} placeholder="Cover letter…" minHeight="160px" maxLength={LIMITS.coverLetter} />
          <Field label="Контакт (рекрутер, HR)" count={{ length: contact.length, max: LIMITS.contact }}>
            <Textarea
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Ім’я, Telegram, LinkedIn, email"
              className="min-h-12"
              maxLength={LIMITS.contact}
            />
          </Field>
        </section>

        <Separator className="my-6" />

        <AskedQuestions questions={a.questions} applicationId={a.id} companyId={a.companyId} />

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <MarkdownField label="Текст вакансії" value={description} onChange={setDescription} placeholder="Скопіюйте опис вакансії" minHeight="120px" maxLength={LIMITS.description} />
          <MarkdownField label="Нотатки" value={notes} onChange={setNotes} placeholder="Враження, домовленості, питання до оферу" minHeight="100px" maxLength={LIMITS.notes} />
        </section>

        <div className="mt-6 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionLabel>Мітки</SectionLabel>
            <TagPicker value={a.tags} onChange={(tagIds) => patch({ tagIds })} />
          </section>
          <LinksPanel entity={{ type: 'application', id: a.id }} />
          <AttachmentsPanel entity={{ type: 'application', id: a.id }} />
          <div className="text-meta text-muted-foreground">
            Створено {fmtDateTime(a.createdAt)}
            {a.repliedAt && ` · відповіли ${fmtDateTime(a.repliedAt)}`}
            {a.closedAt && ` · закрито ${fmtDateTime(a.closedAt)}`}
          </div>
        </div>
      </div>
      </RecordMode>
    </div>
  )
}

/** Right-side vacancy editor, opened by ?open=<id>. */
export function ApplicationEditorSheet({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }) {
  const { data: application } = useApi('jobs', 'get', applicationId ?? '', { enabled: !!applicationId })
  const modeRef = useModeRef()
  const guard = guardSheet(modeRef, onClose)
  return (
    <Sheet open={!!applicationId} onOpenChange={guard.onOpenChange}>
      <SheetContent onEscapeKeyDown={guard.onEscapeKeyDown} side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-[660px]">
        {application && application.id === applicationId ? (
          <Editor key={application.id} application={application} onClose={onClose} modeRef={modeRef} />
        ) : (
          <>
            <SheetTitle className="sr-only">Вакансія</SheetTitle>
            <SheetDescription className="sr-only">Завантаження</SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
