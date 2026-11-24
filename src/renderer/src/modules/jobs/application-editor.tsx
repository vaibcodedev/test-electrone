import { useState } from 'react'
import { toast } from 'sonner'
import { FileText, Trash2, X } from 'lucide-react'
import { APPLICATION_STATUSES, WORK_FORMATS, type ApplicationDetails, type ApplicationPatch } from '@shared/domain/jobs'
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
import { Confirm } from '@/components/common/confirm'
import { Choice } from '../crm/parts'
import { CompanyCombobox, LinkInput, NumberInput, TextField } from './j1-fields'
import { APP_STATUS_LABEL, FORMAT_LABEL } from './j1-labels'
import { StageSection } from './stage-section'
import { AskedQuestions } from './application-questions'

function CoverTemplatePicker({ application: a, patch }: { application: ApplicationDetails; patch: (p: ApplicationPatch) => void }) {
  const { data: letters = [] } = useApi('templates', 'list', { situation: 'cover_letter' })
  const [selected, setSelected] = useState<string | null>(a.templateId)
  const tpl = letters.find((t) => t.id === selected)
  const insert = (): void => {
    if (!tpl) return
    patch({ coverLetter: tpl.body, templateId: tpl.id })
    void api.templates.markCopied(tpl.id)
    toast.success('Шаблон вставлен — замените {переменные}')
  }
  const button = (
    <Button variant="soft" disabled={!tpl}>
      <FileText /> Вставить
    </Button>
  )
  return (
    <div className="flex items-end gap-2">
      <Field label="Шаблон сопроводительного" className="flex-1">
        <Choice
          value={selected}
          onChange={(v) => {
            setSelected(v)
            patch({ templateId: v })
          }}
          none="Без шаблона"
          placeholder={letters.length ? 'Выберите шаблон' : 'Шаблонов пока нет'}
          options={letters.map((t) => ({ value: t.id, label: t.title }))}
        />
      </Field>
      {a.coverLetter.trim() ? (
        <Confirm title="Заменить текст письма?" description="Текущий текст будет заменён шаблоном." confirmLabel="Заменить" onConfirm={insert}>
          {button}
        </Confirm>
      ) : (
        <Button variant="soft" disabled={!tpl} onClick={insert}>
          <FileText /> Вставить
        </Button>
      )}
    </div>
  )
}

function Editor({ application: a, onClose }: { application: ApplicationDetails; onClose: () => void }) {
  const update = useApiMutation('jobs', 'update')
  const remove = useApiMutation('jobs', 'remove', { successMessage: 'Вакансия в корзине', onSuccess: onClose })
  const { data: boards = [] } = useApi('jobs', 'boards', { includeInactive: true })
  const { data: resumes = [] } = useApi('jobs', 'resumes')
  const patch = (p: ApplicationPatch): void => update.mutate({ id: a.id, patch: p })
  const [title, setTitle] = useAutosave(a.title, (t) => t.trim() && patch({ title: t.trim() }))
  const [cover, setCover] = useAutosave(a.coverLetter, (v) => patch({ coverLetter: v }))
  const [description, setDescription] = useAutosave(a.description, (v) => patch({ description: v }))
  const [notes, setNotes] = useAutosave(a.notes, (v) => patch({ notes: v }))
  const [contact, setContact] = useAutosave(a.contact, (v) => patch({ contact: v }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <PinButtons entity={{ type: 'application', id: a.id }} />
        <div className="flex-1" />
        <Choice
          size="sm"
          value={a.status}
          onChange={(v) => v && patch({ status: v })}
          options={APPLICATION_STATUSES.map((s) => ({ value: s, label: APP_STATUS_LABEL[s] }))}
          className="w-44"
        />
        <Confirm title="Убрать вакансию в корзину?" description="Связанные события календаря тоже уйдут в корзину." confirmLabel="В корзину" onConfirm={() => remove.mutate(a.id)}>
          <Button variant="ghost" size="icon-sm" aria-label="В корзину">
            <Trash2 />
          </Button>
        </Confirm>
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
        <SheetTitle className="sr-only">{a.title}</SheetTitle>
        <SheetDescription className="sr-only">Редактирование вакансии</SheetDescription>
        <InlineTitle value={title} onChange={setTitle} placeholder="Позиция" className="text-[24px]" />

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Компания" className="col-span-2">
            <CompanyCombobox
              value={{ companyId: a.companyId, companyName: a.companyName }}
              onChange={({ companyId, companyName }) => patch({ companyId, companyName })}
            />
          </Field>
          <Field label="Площадка">
            <Choice
              value={a.boardId}
              onChange={(boardId) => patch({ boardId })}
              none="Не указана"
              options={boards.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Field>
          <Field label="Ссылка на вакансию">
            <LinkInput value={a.url} onSave={(url) => patch({ url })} />
          </Field>
          <Field label="Отправлено">
            <DatePicker value={a.appliedAt} onChange={(appliedAt) => patch({ appliedAt })} placeholder="Ещё не отправлено" />
          </Field>
          <Field label="Напомнить о себе">
            <DatePicker value={a.followUpAt} onChange={(followUpAt) => patch({ followUpAt })} placeholder="Не напоминать" />
          </Field>
        </div>

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <SectionLabel>Условия</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Зарплата от">
              <NumberInput value={a.salaryMin} onCommit={(salaryMin) => patch({ salaryMin })} />
            </Field>
            <Field label="до">
              <NumberInput value={a.salaryMax} onCommit={(salaryMax) => patch({ salaryMax })} />
            </Field>
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
            <TextField label="Город / часовой пояс" value={a.location} onSave={(location) => patch({ location })} placeholder="Киев, EU timezone…" />
          </div>
        </section>

        <Separator className="my-6" />

        <StageSection applicationId={a.id} stages={a.stages} />

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <SectionLabel>Что отправил</SectionLabel>
          <Field label="Версия резюме">
            <Choice
              value={a.resumeId}
              onChange={(resumeId) => patch({ resumeId })}
              none="Не указана"
              placeholder={resumes.length ? 'Выберите версию' : 'Загрузите резюме в разделе «Резюме»'}
              options={resumes.map((r) => ({
                value: r.id,
                label: `${r.title}${r.isCurrent ? ' · текущая' : ''} — ${fmtDate(r.createdAt, 'd MMM')}`
              }))}
            />
          </Field>
          <CoverTemplatePicker key={a.id} application={a} patch={patch} />
          <MarkdownField label="Сопроводительное письмо" value={cover} onChange={setCover} placeholder="Cover letter…" minHeight="160px" />
          <Field label="Контакт (рекрутер, HR)">
            <Textarea value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Имя, Telegram, LinkedIn, email" className="min-h-12" />
          </Field>
        </section>

        <Separator className="my-6" />

        <AskedQuestions questions={a.questions} applicationId={a.id} companyId={a.companyId} />

        <Separator className="my-6" />

        <section className="flex flex-col gap-4">
          <MarkdownField label="Текст вакансии" value={description} onChange={setDescription} placeholder="Скопируйте описание вакансии" minHeight="120px" />
          <MarkdownField label="Заметки" value={notes} onChange={setNotes} placeholder="Впечатления, договорённости, вопросы к оферу" minHeight="100px" />
        </section>

        <div className="mt-6 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionLabel>Метки</SectionLabel>
            <TagPicker value={a.tags} onChange={(tagIds) => patch({ tagIds })} />
          </section>
          <LinksPanel entity={{ type: 'application', id: a.id }} />
          <AttachmentsPanel entity={{ type: 'application', id: a.id }} />
          <div className="text-[11.5px] text-muted-foreground">
            Создано {fmtDateTime(a.createdAt)}
            {a.repliedAt && ` · ответили ${fmtDateTime(a.repliedAt)}`}
            {a.closedAt && ` · закрыто ${fmtDateTime(a.closedAt)}`}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Right-side vacancy editor, opened by ?open=<id>. */
export function ApplicationEditorSheet({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }) {
  const { data: application } = useApi('jobs', 'get', applicationId ?? '', { enabled: !!applicationId })
  return (
    <Sheet open={!!applicationId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-[660px]">
        {application && application.id === applicationId ? (
          <Editor key={application.id} application={application} onClose={onClose} />
        ) : (
          <>
            <SheetTitle className="sr-only">Вакансия</SheetTitle>
            <SheetDescription className="sr-only">Загрузка</SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
