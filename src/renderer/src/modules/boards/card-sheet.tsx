import { useId, useState, type RefObject } from 'react'
import { Plus, SquareKanban, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  cardCheckInputSchema,
  cardInputSchema,
  PRIORITIES,
  type BoardColumn,
  type CardDetails,
  type CardPatch,
  type ChecklistEntry,
  type Priority
} from '@shared/domain/boards'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime } from '@/lib/format'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { InlineTitle, RecordActions, SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { MarkdownField } from '@/components/common/markdown'
import { EmptyState, Field, Kbd } from '@/components/common/page'
import { ProgressLine } from '@/components/common/progress-line'
import { RowSkeleton } from '@/components/common/page-skeleton'
import { IconAction } from '@/components/common/icon-action'
import { TagsSection } from '@/components/common/tags'
import { LinksPanel } from '@/components/common/links-panel'
import {
  guardSheet,
  RecordMode,
  useModeRef,
  usePublishMode,
  useReadOnly,
  useRecordMode,
  type DetailMode
} from '@/components/common/detail-mode'
import { AttachmentsPanel } from '@/components/common/attachments'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PRIORITY_DOT, PRIORITY_LABEL } from './labels'
import { DueChip } from './card-tile'

const LIMITS = limitsOf(cardInputSchema)
const ENTRY_MAX = limitsOf(cardCheckInputSchema).text

function ChecklistRow({ entry }: { entry: ChecklistEntry }) {
  const update = useApiMutation('cards', 'updateCheck')
  const remove = useApiMutation('cards', 'removeCheck')
  const [text, setText] = useAutosave(
    entry.text,
    (t) => t.trim() && update.mutate({ id: entry.id, text: t.trim() })
  )
  const readOnly = useReadOnly()
  const cbId = useId()
  return (
    <li className="group flex items-center gap-2.5 rounded-xl px-2 py-1 hover:bg-surface">
      <Checkbox
        id={cbId}
        checked={entry.done}
        onCheckedChange={(done) => update.mutate({ id: entry.id, done: !!done })}
        aria-label={entry.text}
      />
      {/* A tick works in any mode: while reading, the text is the checkbox's label and toggles it too. */}
      {/* px-2.5 in both modes: the text keeps its place on E, and the field's text doesn't touch its border. */}
      {readOnly ? (
        <Label
          htmlFor={cbId}
          className={cn(
            'min-w-0 flex-1 cursor-pointer px-2.5 py-1.5 text-body leading-snug font-normal text-foreground wrap-anywhere',
            entry.done && 'text-muted-foreground'
          )}
        >
          {entry.text}
        </Label>
      ) : (
        <Input
          value={text}
          maxLength={ENTRY_MAX}
          onChange={(e) => setText(e.target.value)}
          aria-label="Текст пункту"
          className={cn('h-8 min-w-0 flex-1 px-2.5', entry.done && 'text-muted-foreground')}
        />
      )}
      {/* Hidden until hover, but shown as soon as the keyboard reaches the row (WCAG 2.4.7). */}
      <IconAction
        label="Видалити пункт"
        data-edit-only
        onClick={() => remove.mutate(entry.id)}
        className="text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-destructive"
      >
        <X />
      </IconAction>
    </li>
  )
}

function Checklist({ card }: { card: CardDetails }) {
  const [text, setText] = useState('')
  const add = useApiMutation('cards', 'addCheck')
  const readOnly = useReadOnly()
  const done = card.checklist.filter((c) => c.done).length
  const n = card.checklist.length
  // While reading, a card without a checklist shows no empty «Чек-лист» heading.
  if (readOnly && card.checklist.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Чек-лист</SectionLabel>
      {n > 0 && <ProgressLine value={done} total={n} states={card.checklist.map((c) => c.done)} />}
      <ul className="-mx-2 flex flex-col">
        {card.checklist.map((e) => (
          <ChecklistRow key={e.id} entry={e} />
        ))}
        {/* The next item, laid out like the items: «+» where the checkboxes are and a field as wide as theirs. A
            separate form with its own indent and a big «+» button looked detached. */}
        <li data-edit-only className="flex items-center gap-2.5 rounded-xl px-2 py-1">
          <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <form
            className="flex min-w-0 flex-1 items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim() || add.isPending) return
              // Cleared only after the server accepted it: a rejected item stays in the field.
              add.mutate({ cardId: card.id, text: text.trim() }, { onSuccess: () => setText('') })
            }}
          >
            <Input
              value={text}
              maxLength={ENTRY_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder="Додати пункт"
              aria-label="Новий пункт"
              className="h-8 min-w-0 flex-1 px-2.5"
            />
            {/* Appears once there is something to add; Enter does the same. */}
            {text.trim() && (
              <Button type="submit" variant="soft" size="xs" disabled={add.isPending}>
                Додати
              </Button>
            )}
          </form>
        </li>
      </ul>
    </section>
  )
}

function CardEditor({
  card,
  columns,
  onClose,
  modeRef
}: {
  card: CardDetails
  columns: BoardColumn[]
  onClose: () => void
  modeRef?: RefObject<DetailMode | null>
}) {
  const update = useApiMutation('cards', 'update')
  const remove = useApiMutation('cards', 'remove', {
    onSuccess: () => {
      toast.success('Картку переміщено в кошик')
      onClose()
    }
  })
  const patch = (p: CardPatch): void => update.mutate({ id: card.id, patch: p })
  const [title, setTitle] = useAutosave(card.title, (t) => t.trim() && patch({ title: t.trim() }))
  const [description, setDescription] = useAutosave(card.description, (d) =>
    patch({ description: d })
  )

  const mode = useRecordMode(card.id, 'card')
  usePublishMode(modeRef, mode)
  const sparse = !card.description.trim() && card.checklist.length === 0 && !card.dueAt
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Same header order as every record (DetailPane): Esc in the sheet goes through guardSheet, not data-close-detail. */}
      <RecordActions
        entity={{ type: 'card', id: card.id }}
        mode={mode}
        extra={
          <span className="min-w-0 truncate text-caption text-muted-foreground">
            {card.boardTitle}
          </span>
        }
        onDelete={() => remove.mutate(card.id)}
        onClose={onClose}
        className="border-b border-border px-5 py-3"
      />
      <RecordMode mode={mode}>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <SheetTitle className="sr-only">{card.title}</SheetTitle>
          <SheetDescription className="sr-only">Картка дошки</SheetDescription>
          <InlineTitle
            value={title}
            onChange={setTitle}
            placeholder="Назва картки"
            maxLength={LIMITS.title}
            className="text-headline"
          />

          <div className="mt-5 grid grid-cols-2 gap-4">
            <Field label="Колонка">
              <Select value={card.columnId} onValueChange={(columnId) => patch({ columnId })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Пріоритет">
              {/* «Без пріоритету» is a placeholder, not a value: view mode hides the field (globals.css). */}
              <Select
                value={card.priority === 'none' ? '' : card.priority}
                onValueChange={(v) => patch({ priority: v as Priority })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={PRIORITY_LABEL.none} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className={cn('size-2 rounded-full', PRIORITY_DOT[p])} />
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {mode.editing ? (
              <Field label="Дедлайн" className="col-span-2">
                <DatePicker
                  withTime
                  value={card.dueAt}
                  onChange={(dueAt) => patch({ dueAt })}
                  placeholder="Без дедлайну"
                />
              </Field>
            ) : (
              card.dueAt && (
                // Same chip as on the kanban: an overdue deadline is red here too.
                <Field label="Дедлайн" className="col-span-2">
                  {/* Field stretches its direct children: the wrapper takes the width, the chip stays as wide as its text. */}
                  <div>
                    <DueChip
                      dueAt={card.dueAt}
                      done={columns.find((c) => c.id === card.columnId)?.isDone ?? false}
                    />
                  </div>
                </Field>
              )
            )}
          </div>
          {!mode.editing && sparse && (
            <p className="mt-5 text-body text-muted-foreground">
              Опису, дедлайну й чек-листа поки немає. Натисніть «Редагувати» або <Kbd>E</Kbd>, щоб
              додати.
            </p>
          )}

          <section className="mt-5">
            <MarkdownField
              label="Опис"
              value={description}
              onChange={setDescription}
              placeholder="Опис, посилання, деталі…"
              maxLength={LIMITS.description}
              minHeight="160px"
            />
          </section>

          <div className="mt-6">
            <Checklist card={card} />
          </div>

          <div className="mt-6 flex flex-col gap-6">
            {/* Same order as every record column: fields → мітки → зв’язки → файли. */}
            <TagsSection value={card.tags} onChange={(tagIds) => patch({ tagIds })} />
            <LinksPanel entity={{ type: 'card', id: card.id }} />
            <AttachmentsPanel entity={{ type: 'card', id: card.id }} />
            <div className="text-meta text-muted-foreground">
              Створено {fmtDateTime(card.createdAt)}
              {card.completedAt && ` · виконано ${fmtDateTime(card.completedAt)}`}
            </div>
          </div>
        </div>
      </RecordMode>
    </div>
  )
}

/** Right-side card editor, opened by ?card=<id>. */
export function CardSheet({
  cardId,
  columns,
  onClose
}: {
  cardId: string | null
  columns: BoardColumn[]
  onClose: () => void
}) {
  const { data: card, isLoading } = useApi('cards', 'get', cardId ?? '', { enabled: !!cardId })
  const modeRef = useModeRef()
  const guard = guardSheet(modeRef, onClose)
  return (
    <Sheet open={!!cardId} onOpenChange={guard.onOpenChange}>
      <SheetContent
        onEscapeKeyDown={guard.onEscapeKeyDown}
        side="right"
        showCloseButton={false}
        className="w-full gap-0 p-0 sm:max-w-140"
      >
        {card && card.id === cardId ? (
          <CardEditor
            key={card.id}
            card={card}
            columns={columns}
            onClose={onClose}
            modeRef={modeRef}
          />
        ) : (
          <>
            <SheetTitle className="sr-only">Картка</SheetTitle>
            <SheetDescription className="sr-only">
              {isLoading ? 'Завантаження' : 'Картку не знайдено'}
            </SheetDescription>
            {isLoading ? (
              <div className="flex flex-col gap-3 p-6">
                <Skeleton className="h-8 w-2/3" />
                <RowSkeleton />
                <RowSkeleton />
              </div>
            ) : (
              cardId && (
                <EmptyState
                  icon={SquareKanban}
                  title="Картку не знайдено"
                  hint="Можливо, вона в кошику."
                  cta={{ label: 'Закрити', onClick: onClose }}
                />
              )
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
