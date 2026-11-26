import { useId, useState, type ReactElement, type RefObject } from 'react'
import { toast } from 'sonner'
import { FileText, FileUser, X } from 'lucide-react'
import { APPLICATION_STATUSES, WORK_FORMATS, applicationInputSchema, type ApplicationDetails, type ApplicationPatch } from '@shared/domain/jobs'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useApi, useApiMutation } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { useAutosave } from '@/hooks/use-autosave'
import { useStillCurrent } from '@/hooks/use-still-current'
import { fmtDayFull } from '@/lib/format'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { NumberInput } from '@/components/common/number-input'
import { EmptyState, Field, Segmented } from '@/components/common/page'
import { EntityAside, InlineTitle, RecordActions, SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { MarkdownField } from '@/components/common/markdown'
import { Delayed } from '@/components/common/page-skeleton'
import { useReadOnly } from '@/components/common/detail-mode-context'
import {
  guardSheet,
  RecordMode,
  useModeRef,
  usePublishMode,
  useRecordMode,
  type DetailMode
} from '@/components/common/detail-mode'
import { Confirm } from '@/components/common/confirm'
import { LinkInput, TextField } from '@/components/common/text-field'
import { IconAction } from '@/components/common/icon-action'
import { Choice } from '@/components/common/choice'
import { CurrencySelect } from '@/components/common/currency-select'
import { promptAfterStatusChange } from './schedule-stage'
import { CompanyCombobox } from './j1-fields'
import { APP_STATUS_LABEL, FORMAT_LABEL, salaryLabel } from './labels'
import { StageSection } from './stage-section'
import { AskedQuestions } from './application-questions'

const LIMITS = limitsOf(applicationInputSchema)
const RANGES = rangesOf(applicationInputSchema)

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
}): ReactElement {
  const [draft, setDraft] = useState({ min, max })
  // The server value changed («Скасувати», another window): adopt it during render, not in an effect.
  const [src, setSrc] = useState({ min, max })
  if (src.min !== min || src.max !== max) {
    setSrc({ min, max })
    setDraft({ min, max })
  }
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

function CoverTemplatePicker({ application: a, patch }: { application: ApplicationDetails; patch: (p: ApplicationPatch) => void }): ReactElement {
  const { data: letters = [] } = useApi('templates', 'list', { situation: 'cover_letter' })
  const mark = useApiMutation('templates', 'markCopied', { silent: true, onError: (e) => reportError(e) })
  const [selected, setSelected] = useState<string | null>(a.templateId)
  const tpl = letters.find((t) => t.id === selected)
  const insert = (): void => {
    if (!tpl) return
    patch({ coverLetter: tpl.body, templateId: tpl.id })
    mark.mutate(tpl.id)
    toast.success('Шаблон вставлено — замініть {змінні}')
  }
  // With a letter already written, «Вставити» asks first (Confirm handles the click).
  const button = (
    <Button variant="soft" disabled={!tpl} onClick={a.coverLetter.trim() ? undefined : insert}>
      <FileText /> Вставити
    </Button>
  )
  return (
    // Picking a template changes the record, so it lives in edit mode only.
    <div data-edit-only className="flex items-end gap-2">
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
        button
      )}
    </div>
  )
}

/** «Умови»: one readable salary line in view mode, the fields while editing. */
function ConditionsSection({ application: a, patch }: { application: ApplicationDetails; patch: (p: ApplicationPatch) => void }): ReactElement {
  const readOnly = useReadOnly()
  const salary = salaryLabel(a.salaryMin, a.salaryMax, a.currency)
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Умови</SectionLabel>
      {readOnly ? (
        <Field label="Зарплата">{salary ? <span className="text-body tabular-nums">{salary}</span> : <span data-empty />}</Field>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <SalaryFields min={a.salaryMin} max={a.salaryMax} patch={patch} />
          <Field label="Валюта">
            <CurrencySelect value={a.currency} onChange={(currency) => patch({ currency })} />
          </Field>
        </div>
      )}
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
  )
}

/** «Що надіслано»: resume version, cover letter (template or text) and the recruiter contact. */
function SentSection({ application: a, patch }: { application: ApplicationDetails; patch: (p: ApplicationPatch) => void }): ReactElement {
  const readOnly = useReadOnly()
  const { data: resumes = [] } = useApi('jobs', 'resumes')
  const [cover, setCover] = useAutosave(a.coverLetter, (v) => patch({ coverLetter: v }))
  const [contact, setContact] = useAutosave(a.contact, (v) => patch({ contact: v }))
  const resume = resumes.find((r) => r.id === a.resumeId)
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Що надіслано</SectionLabel>
      <Field label="Версія резюме">
        {/* View mode: the version's name as text — the Select's «Не вказано» kept an empty field visible. */}
        {readOnly ? (
          resume ? (
            <span className="text-body">
              {resume.title}
              {resume.isCurrent ? ' (поточна)' : ''}
            </span>
          ) : (
            <span data-empty />
          )
        ) : (
        <Choice
          value={a.resumeId}
          onChange={(resumeId) => patch({ resumeId })}
          none="Не вказано"
          placeholder={resumes.length ? 'Виберіть версію' : 'Завантажте резюме в розділі «Резюме»'}
          options={resumes.map((r) => ({ value: r.id, label: `${r.title}${r.isCurrent ? ' (поточна)' : ''}` }))}
        />
        )}
      </Field>
      <CoverTemplatePicker key={a.id} application={a} patch={patch} />
      <MarkdownField
        label="Супровідний лист"
        value={cover}
        onChange={setCover}
        placeholder="Текст супровідного листа…"
        minHeight="160px"
        maxLength={LIMITS.coverLetter}
      />
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
  )
}

/**
 * Sheet header in the order of every record (RecordActions): pins → status (always changeable) → (gap) →
 * trash (asks first: calendar events go too) → «Редагувати» / «Скасувати»·«Зберегти» → ✕.
 */
function ApplicationEditorHeader({
  application: a,
  mode,
  patch,
  onClose
}: {
  application: ApplicationDetails
  mode: DetailMode
  patch: (p: ApplicationPatch) => void
  onClose: () => void
}): ReactElement {
  // Closes after the request: not if another vacancy was opened meanwhile.
  const stillOpen = useStillCurrent(a.id)
  const remove = useApiMutation('jobs', 'remove', {
    successMessage: 'Вакансію переміщено в кошик',
    onSuccess: () => stillOpen() && onClose()
  })
  const statusId = useId()
  return (
    <RecordActions
      entity={{ type: 'application', id: a.id }}
      mode={mode}
      extra={
        <>
          <Label htmlFor={statusId} className="sr-only">
            Статус вакансії
          </Label>
          <Choice
            id={statusId}
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
        </>
      }
      onDelete={() => remove.mutate(a.id)}
      deleteConfirm={{ title: 'Видалити вакансію?', description: 'Вакансія й пов’язані події календаря підуть у кошик на 30 днів.' }}
      onClose={onClose}
      className="border-b border-border px-4 py-2.5"
    />
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
}): ReactElement {
  const update = useApiMutation('jobs', 'update')
  const { data: boards = [] } = useApi('jobs', 'boards', { includeInactive: true })
  const patch = (p: ApplicationPatch): void => update.mutate({ id: a.id, patch: p })
  const [title, setTitle] = useAutosave(a.title, (t) => t.trim() && patch({ title: t.trim() }))
  const [description, setDescription] = useAutosave(a.description, (v) => patch({ description: v }))
  const [notes, setNotes] = useAutosave(a.notes, (v) => patch({ notes: v }))

  const mode = useRecordMode(a.id, 'application')
  usePublishMode(modeRef, mode)
  const board = boards.find((b) => b.id === a.boardId)
  // While reading, a section with nothing in it is not drawn, its separator included; «Етапи» stays, its
  // hint is how one learns to add a stage.
  const hasTexts = mode.editing || !!a.description.trim() || !!a.notes.trim()
  const hasSent = mode.editing || !!a.resumeId || !!a.coverLetter.trim() || !!a.contact.trim()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ApplicationEditorHeader application={a} mode={mode} patch={patch} onClose={onClose} />

      <RecordMode mode={mode}>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <SheetTitle className="sr-only">{a.title}</SheetTitle>
        <SheetDescription className="sr-only">Вакансія</SheetDescription>
        <InlineTitle value={title} onChange={setTitle} placeholder="Посада" className="text-headline" maxLength={LIMITS.title} />

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Компанія" className="col-span-2">
            <CompanyCombobox
              value={{ companyId: a.companyId, companyName: a.companyName }}
              onChange={({ companyId, companyName }) => patch({ companyId, companyName })}
            />
          </Field>
          <Field label="Майданчик">
            {/* Editor sits outside RecordMode, so it reads the mode itself; «Не вказано» isn't shown as a value. */}
            {mode.editing ? (
              <Choice
                value={a.boardId}
                onChange={(boardId) => patch({ boardId })}
                none="Не вказано"
                options={boards.map((b) => ({ value: b.id, label: b.name }))}
              />
            ) : board ? (
              <span className="text-body">{board.name}</span>
            ) : (
              <span data-empty />
            )}
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
          {/* Set by status changes, not typed in: shown next to «Надіслано», where the reply date is looked for. */}
          {a.repliedAt && (
            <Field label="Відповіли">
              <span className="text-body">{fmtDayFull(a.repliedAt)}</span>
            </Field>
          )}
          {a.closedAt && (
            <Field label="Закрито">
              <span className="text-body">{fmtDayFull(a.closedAt)}</span>
            </Field>
          )}
        </div>

        <Separator className="my-6" />

        <ConditionsSection application={a} patch={patch} />

        <Separator className="my-6" />

        <StageSection applicationId={a.id} stages={a.stages} />

        {hasSent && (
          <>
            <Separator className="my-6" />
            <SentSection application={a} patch={patch} />
          </>
        )}

        {/* Brings its own separator; while reading an empty list it renders nothing. */}
        <AskedQuestions questions={a.questions} applicationId={a.id} companyId={a.companyId} />

        {hasTexts && (
          <>
            <Separator className="my-6" />
            <section className="flex flex-col gap-4">
              <MarkdownField label="Текст вакансії" value={description} onChange={setDescription} placeholder="Вставте текст вакансії" minHeight="120px" maxLength={LIMITS.description} />
              <MarkdownField label="Нотатки" value={notes} onChange={setNotes} placeholder="Враження, домовленості, питання до оферу" minHeight="100px" maxLength={LIMITS.notes} />
            </section>
          </>
        )}

        {/* The standard column; tags hide while empty in view mode. */}
        <div className="mt-6 flex flex-col gap-2">
          <EntityAside
            entity={{ type: 'application', id: a.id }}
            tags={a.tags}
            onTagsChange={(tagIds) => patch({ tagIds })}
            createdAt={a.createdAt}
            updatedAt={a.updatedAt}
          />
        </div>
      </div>
      </RecordMode>
    </div>
  )
}

/** The sheet's shape while `jobs.get` is on its way: header row, title, a 2×2 grid of fields. */
function EditorSkeleton(): ReactElement {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-8 w-44 rounded-full" />
        <Skeleton className="ml-auto h-8 w-28 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="flex flex-col gap-5 px-6 py-5">
        <Skeleton className="h-8 w-2/3 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24 rounded-full" />
              <Skeleton className="h-9 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * `?open=` points at a vacancy that is gone (trash, deleted; «Назад» after deleting, an old pin): say so and
 * offer a way out instead of a skeleton that never ends.
 */
function MissingApplication({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end border-b border-border px-4 py-2.5">
        <IconAction label="Закрити" size="icon-sm" onClick={onClose}>
          <X />
        </IconAction>
      </div>
      <EmptyState
        icon={FileUser}
        title="Вакансію не знайдено"
        hint="Можливо, її переміщено в кошик."
        cta={{ label: 'Закрити', onClick: onClose }}
        className="flex-1"
      />
    </div>
  )
}

/** Right-side vacancy editor, opened by ?open=<id>. */
export function ApplicationEditorSheet({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }): ReactElement {
  const { data: application, isLoading } = useApi('jobs', 'get', applicationId ?? '', { enabled: !!applicationId })
  const modeRef = useModeRef()
  const guard = guardSheet(modeRef, onClose)
  return (
    <Sheet open={!!applicationId} onOpenChange={guard.onOpenChange}>
      <SheetContent onEscapeKeyDown={guard.onEscapeKeyDown} side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-165">
        {application && application.id === applicationId ? (
          <Editor key={application.id} application={application} onClose={onClose} modeRef={modeRef} />
        ) : (
          <>
            <SheetTitle className="sr-only">Вакансія</SheetTitle>
            <SheetDescription className="sr-only">{isLoading ? 'Завантаження' : 'Вакансію не знайдено'}</SheetDescription>
            {isLoading ? (
              <Delayed delay={150}>
                <EditorSkeleton />
              </Delayed>
            ) : (
              <MissingApplication onClose={onClose} />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
