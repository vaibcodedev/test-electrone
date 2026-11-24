import { useRef, useState, type ReactNode } from 'react'
import { CircleCheck, Eye, FileText, FileUp, Trash2, Upload } from 'lucide-react'
import type { FileSource } from '@shared/domain/designs'
import { resumeInputSchema, type JobBoard, type Resume } from '@shared/domain/jobs'
import { limitsOf } from '@/lib/limits'

const LIMITS = limitsOf(resumeInputSchema)
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fileUrl, toFileSources } from '@/lib/files'
import { fmtBytes, fmtDateTime, fmtDay, fmtPercent } from '@/lib/format'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { cn } from '@/lib/utils'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Hidden native file input driven by a shadcn Button (the only allowed native input). */
function useFilePicker(onPick: (sources: FileSource[]) => void): { open: () => void; input: ReactNode } {
  const ref = useRef<HTMLInputElement>(null)
  return {
    open: () => ref.current?.click(),
    input: (
      <input
        ref={ref}
        type="file"
        accept=".pdf,.doc,.docx,.rtf,.txt,.md"
        className="hidden"
        onChange={async (e) => {
          if (e.target.files?.length) onPick(await toFileSources(e.target.files))
          e.target.value = ''
        }}
      />
    )
  }
}

function NewVersionDialog({
  open,
  onOpenChange,
  source,
  suggestedTitle
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: FileSource | null
  suggestedTitle: string
}) {
  const create = useApiMutation('jobs', 'createResume', { successMessage: 'Версію резюме додано' })
  const [title, setTitle] = useState(suggestedTitle)
  const [changes, setChanges] = useState('')
  const [isCurrent, setIsCurrent] = useState(true)
  const fileName = source?.kind === 'path' ? source.path.split(/[\\/]/).pop() : source?.kind === 'bytes' ? source.name : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (o) {
          setTitle(suggestedTitle)
          setChanges('')
          setIsCurrent(true)
        }
      }}
    >
      <DialogContent className="rounded-3xl sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">Нова версія резюме</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            create.mutate(
              { input: { title: title.trim(), changes, isCurrent }, source: source ?? undefined },
              { onSuccess: () => onOpenChange(false) }
            )
          }}
        >
          {fileName && (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-body">
              <FileText className="size-4 text-muted-foreground" /> {fileName}
            </div>
          )}
          <Field className="gap-2">
            <FieldLabel htmlFor="resume-title">Назва версії</FieldLabel>
            <Input id="resume-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="v3 Frontend, акцент на Next.js" maxLength={LIMITS.title} />
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor="resume-changes">Що змінив</FieldLabel>
            <Textarea id="resume-changes" value={changes} onChange={(e) => setChanges(e.target.value)} placeholder="Додав проєкт на Hydrogen, прибрав старий досвід…" maxLength={LIMITS.changes} />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="resume-current" checked={isCurrent} onCheckedChange={(v) => setIsCurrent(v === true)} />
            <Label htmlFor="resume-current" className="text-body text-foreground">
              Зробити поточною — її надсилатиму
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="submit" variant="lime" disabled={!title.trim() || create.isPending}>
              Додати версію
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResumeCard({ resume, boards, onPreview }: { resume: Resume; boards: JobBoard[]; onPreview: () => void }) {
  const update = useApiMutation('jobs', 'updateResume')
  const replace = useApiMutation('jobs', 'replaceResumeFile', { successMessage: 'Файл замінено' })
  const remove = useApiMutation('jobs', 'removeResume', { successMessage: 'Версію видалено' })
  const setUploaded = useApiMutation('jobs', 'setResumeUploaded')
  const picker = useFilePicker((sources) => sources[0] && replace.mutate({ id: resume.id, source: sources[0] }))
  const uploadedOn = new Map(resume.boards.map((b) => [b.boardId, b.uploadedAt]))
  const missing = boards.filter((b) => b.active && !uploadedOn.has(b.id))
  const isPdf = resume.mime === 'application/pdf' || /\.pdf$/i.test(resume.fileName)

  return (
    // Inset ring: an outer ring got clipped by the scrolling list (docs/design-system.md → selection rings).
    <Card className={cn(resume.isCurrent && 'ring-2 ring-chart-1 ring-inset')}>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2 text-heading font-normal text-foreground">
          {resume.title}
          {resume.isCurrent && <Badge variant="success">поточна</Badge>}
        </CardTitle>
        <CardDescription>
          {fmtDateTime(resume.createdAt)}
          {resume.sent > 0 && ` · надіслано ${resume.sent}, відповіли ${resume.replied} (${fmtPercent(resume.replyRate)})`}
        </CardDescription>
        <CardAction className="flex gap-1">
          {!resume.isCurrent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Зробити поточною" onClick={() => update.mutate({ id: resume.id, patch: { isCurrent: true } })}>
                  <CircleCheck />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Зробити поточною</TooltipContent>
            </Tooltip>
          )}
          <Confirm
            title={`Видалити «${resume.title}»?`}
            description="Файл буде видалено; у надісланих відгуках залишиться позначка без файлу."
            onConfirm={() => remove.mutate(resume.id)}
          >
            <Button variant="ghost" size="icon-sm" aria-label="Видалити версію">
              <Trash2 />
            </Button>
          </Confirm>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {resume.changes && <p className="text-body whitespace-pre-wrap">{resume.changes}</p>}
        <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          {resume.filePath && isPdf ? (
            <Button variant="link" className="min-w-0 flex-1 justify-start truncate text-body font-normal" onClick={onPreview}>
              {resume.fileName}
            </Button>
          ) : (
            <span className={cn('min-w-0 flex-1 truncate text-body', !resume.filePath && 'text-muted-foreground')}>
              {resume.fileName || 'Файл не прикріплено'}
            </span>
          )}
          {resume.size > 0 && <span className="text-caption text-muted-foreground">{fmtBytes(resume.size)}</span>}
          {resume.filePath && isPdf && (
            <Button variant="ghost" size="xs" onClick={onPreview}>
              <Eye /> Відкрити
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="subtle" size="xs" onClick={picker.open}>
                <FileUp /> {resume.filePath ? 'Замінити файл' : 'Прикріпити файл'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {resume.filePath ? 'Замінити файл цієї версії (старий файл буде видалено)' : 'Прикріпити PDF або документ до цієї версії'}
            </TooltipContent>
          </Tooltip>
          {picker.input}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-muted-foreground">Де завантажено цю версію</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {boards.map((b) => {
              const id = `rb-${resume.id}-${b.id}`
              const at = uploadedOn.get(b.id)
              return (
                <div key={b.id} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={!!at}
                    onCheckedChange={(v) => setUploaded.mutate({ resumeId: resume.id, boardId: b.id, uploaded: v === true })}
                  />
                  <Label htmlFor={id} className="text-body font-normal text-foreground">
                    {b.name}
                    {at && <span className="ml-1 text-meta text-muted-foreground">{fmtDay(at)}</span>}
                  </Label>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
      {resume.isCurrent && missing.length > 0 && (
        <CardFooter>
          <Badge variant="warn" className="h-auto py-1 whitespace-normal">
            Залишилося оновити: {missing.map((b) => b.name).join(', ')}
          </Badge>
        </CardFooter>
      )}
    </Card>
  )
}

/** Resume versions: files, what changed, where each version is uploaded, which one gets replies. */
export function ResumesPage() {
  const { data: resumes = [] } = useApi('jobs', 'resumes')
  const { data: boards = [] } = useApi('jobs', 'boards')
  const [pending, setPending] = useState<FileSource | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [preview, setPreview] = useState<Resume | null>(null)

  const startUpload = (sources: FileSource[]): void => {
    if (!sources[0]) return
    setPending(sources[0])
    setDialogOpen(true)
  }
  const picker = useFilePicker(startUpload)
  const { isOver, props } = useFileDrop(startUpload)
  usePasteFiles(startUpload, !dialogOpen)
  const suggested = `v${resumes.length + 1}`

  return (
    <Page>
      <PageHeader
        title="Резюме"
        subtitle="Кожне надсилання позначається версією — статистика покаже, яка частіше отримує відповіді."
        actions={
          <>
            <Button
              variant="soft"
              onClick={() => {
                setPending(null)
                setDialogOpen(true)
              }}
            >
              Без файлу
            </Button>
            <Button variant="lime" onClick={picker.open}>
              <Upload /> Завантажити версію
            </Button>
            {picker.input}
          </>
        }
      />
      <PageBody>
        <div {...props} className={cn('flex flex-col gap-3 rounded-3xl transition-colors', isOver && 'bg-lime-soft')}>
          {resumes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Резюме ще немає"
              hint="Перетягніть PDF або DOCX сюди, вставте через Ctrl+V або натисніть «Завантажити версію»."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Current version first, then newest; the key changes with «current» so the moved card replays its entrance. */}
              {[...resumes]
                .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.createdAt - a.createdAt)
                .map((r) => (
                  <div key={`${r.id}:${r.isCurrent ? 'current' : 'old'}`} className="animate-enter">
                    <ResumeCard resume={r} boards={boards} onPreview={() => setPreview(r)} />
                  </div>
                ))}
            </div>
          )}
          {resumes.length > 0 && (
            <p className="text-center text-caption text-muted-foreground">Перетягніть файл сюди, щоб додати нову версію.</p>
          )}
        </div>
      </PageBody>
      <NewVersionDialog open={dialogOpen} onOpenChange={setDialogOpen} source={pending} suggestedTitle={suggested} />
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="flex h-[85vh] flex-col gap-3 rounded-3xl sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          {/* Only PDFs are shown inline; any other file opens in its own app (never rendered as a page here). */}
          {preview?.filePath && /\.pdf$/i.test(preview.fileName ?? preview.filePath) ? (
            <iframe title={preview.fileName} src={fileUrl(preview.filePath)} className="min-h-0 w-full flex-1 rounded-2xl border-0 bg-white" />
          ) : (
            preview?.filePath && (
              <EmptyState
                title="Перегляд доступний лише для PDF"
                hint="Інші формати відкриваються в програмі за замовчуванням."
                action={
                  <Button variant="subtle" onClick={() => void api.files.openPath(preview.filePath!)}>
                    Відкрити файл
                  </Button>
                }
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </Page>
  )
}
