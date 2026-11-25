import { useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { Award, FileText, Handshake, Trash2, X } from 'lucide-react'
import {
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
import { limitsOf } from '@/lib/limits'
import { LinkInput } from '@/components/common/text-field'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime } from '@/lib/format'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Field } from '@/components/common/page'
import { InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { MarkdownField } from '@/components/common/markdown'
import { TagPicker } from '@/components/common/tags'
import { LinksPanel } from '@/components/common/links-panel'
import { PinButtons } from '@/components/common/pin-buttons'
import { Choice } from '../crm/parts'
import { PROPOSAL_STATUS_LABEL } from './proposal-labels'
import { HireDialog } from './hire-dialog'
import { NicheCombobox } from './niche-combobox'
import { PreChecklist } from './pre-checklist'
import { TemplatePicker } from './template-picker'
import { ProposalBidSection } from './proposal-bid-section'
import { ProposalClientSection } from './proposal-client-section'

const PROPOSAL_L = limitsOf(proposalInputSchema)

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
  const hasChecklist = platform.preChecklist.length > 0
  // Nothing written yet: in view mode the text section is empty, so its separator goes too.
  const noTexts = !p.coverLetter.trim() && !p.jobDescription.trim() && !p.notes.trim()
  // Click opens the proposal for reading; «Редагувати» switches it to editing.
  const mode = useRecordMode(p.id, 'proposal')
  usePublishMode(modeRef, mode)

  return (
    <RecordMode mode={mode}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
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
          <EditToggle mode={mode} onClose={onClose} />
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
            className="text-headline"
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
            <LinkInput
              label="Посилання на вакансію"
              value={p.jobUrl}
              onSave={(jobUrl) => patch({ jobUrl })}
              maxLength={PROPOSAL_L.jobUrl}
              openLabel="Відкрити вакансію"
            />
          </div>

          <Separator className="my-6" />
          <ProposalBidSection proposal={p} platform={platform} patch={patch} />
          <Separator className="my-6" />
          <ProposalClientSection proposal={p} platform={platform} patch={patch} />
          <Separator className="my-6" data-edit-only={(noTexts && !hasChecklist) || undefined} />
          <PreChecklist platform={platform} proposal={p} patch={patch} />
          {hasChecklist && <Separator className="my-6" data-edit-only={noTexts || undefined} />}

          <section className="flex flex-col gap-4">
            <div data-edit-only>
              <TemplatePicker key={p.id} proposal={p} patch={patch} />
            </div>
            <MarkdownField
              label="Текст відгуку"
              value={cover}
              onChange={setCover}
              placeholder="Текст, який надішлете клієнту"
              maxLength={PROPOSAL_L.coverLetter}
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
              maxLength={PROPOSAL_L.jobDescription}
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
