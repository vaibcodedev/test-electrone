import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { MAX } from '@shared/domain/limits'
import { linkedPlanLength, planTasks } from '@shared/plan-tasks'
import { useApi, useApiMutation } from '@/lib/query'
import { plural } from '@/lib/format'
import { Choice } from '@/components/common/choice'
import { FormDialog } from '@/components/common/form-dialog'
import { freshOnOpen } from '@/components/common/fresh-on-open'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'

const cardsWord = (n: number): string => plural(n, ['картку', 'картки', 'карток'])

/** «Створити картки»: the plan's unchecked lines become cards of the chosen board and column. */
export const PlanCardsDialog = freshOnOpen(function PlanCardsDialog({
  open,
  onOpenChange,
  weekStart,
  plan
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekStart: string
  plan: string
}) {
  const id = useId()
  const navigate = useNavigate()
  // The lines as they were when the dialog opened: after creating them the plan has none, and the closing dialog
  // must not empty itself.
  const [tasks] = useState(() => planTasks(plan))
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set())
  const [pickedBoard, setBoard] = useState<string | null>(null)
  const [pickedColumn, setColumn] = useState<string | null>(null)

  const boards = useApi('boards', 'list', undefined, { enabled: open })
  const active = boards.data?.filter((b) => !b.archived) ?? []
  const boardId = pickedBoard ?? active[0]?.id
  const details = useApi('boards', 'details', boardId ?? '', { enabled: open && !!boardId })
  // A card made straight in «Готово» would be done already: those columns aren't offered.
  const columns = details.data?.columns.filter((c) => !c.isDone) ?? []
  const columnId = columns.find((c) => c.id === pickedColumn)?.id ?? columns[0]?.id

  const create = useApiMutation('review', 'createCards', {
    onSuccess: ({ boardId, count }) => {
      onOpenChange(false)
      toast.success(`Створено ${count} ${cardsWord(count)}`, {
        action: { label: 'Відкрити', onClick: () => void navigate(`/boards/${boardId}`) }
      })
    }
  })

  const chosen = tasks.filter((t) => !skipped.has(t.line))
  const noBoards = !!boards.data && active.length === 0
  const noColumns = !!details.data && columns.length === 0
  const reason = noBoards
    ? 'Спершу створіть дошку'
    : noColumns
      ? 'На дошці немає колонки для нових карток'
      : chosen.length === 0
        ? 'Позначте хоча б один рядок'
        : chosen.length > 100
          ? 'За раз — не більше 100 карток'
          : linkedPlanLength(
                plan,
                chosen.map((t) => t.line)
              ) > MAX.note
            ? 'У плані не вистачає місця для посилань — скоротіть його'
            : undefined

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Картки з плану"
      description="Позначені рядки стануть картками, а в плані з’являться посилання на них."
      submitLabel={
        chosen.length ? `Створити ${chosen.length} ${cardsWord(chosen.length)}` : 'Створити картки'
      }
      invalid={!!reason || !columnId}
      invalidReason={reason}
      pending={create.isPending}
      onSubmit={() => {
        if (!columnId) return
        create.mutate({
          weekStart,
          columnId,
          tasks: chosen.map(({ line, text }) => ({ line, text }))
        })
      }}
    >
      {noBoards ? (
        <Button type="button" variant="link" className="self-start" asChild>
          <Link to="/boards">Перейти до дощок</Link>
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor={`${id}-board`}>Дошка</FieldLabel>
            <Choice
              id={`${id}-board`}
              value={boardId}
              onChange={(v) => {
                setBoard(v)
                setColumn(null)
              }}
              options={active.map((b) => ({ value: b.id, label: b.title }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-column`}>Колонка</FieldLabel>
            <Choice
              id={`${id}-column`}
              value={columnId}
              onChange={setColumn}
              options={columns.map((c) => ({ value: c.id, label: c.title }))}
            />
          </Field>
        </div>
      )}
      <FieldSet className="gap-2">
        <FieldLegend variant="label">Рядки плану</FieldLegend>
        {/* p-1: focus rings of the checkboxes aren't cut by the scroll box. */}
        <div className="-m-1 flex max-h-72 flex-col gap-3 overflow-y-auto p-1">
          {tasks.map((t) => (
            <Field key={t.line} orientation="horizontal">
              <Checkbox
                id={`${id}-${t.line}`}
                checked={!skipped.has(t.line)}
                onCheckedChange={(on) => {
                  const next = new Set(skipped)
                  if (on === true) next.delete(t.line)
                  else next.add(t.line)
                  setSkipped(next)
                }}
              />
              <FieldLabel htmlFor={`${id}-${t.line}`} className="font-normal break-words text-foreground">
                {t.title}
              </FieldLabel>
            </Field>
          ))}
        </div>
      </FieldSet>
    </FormDialog>
  )
})
