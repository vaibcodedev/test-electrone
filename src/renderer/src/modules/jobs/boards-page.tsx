import { useRef, useState, type ReactElement } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { jobBoardInputSchema, type JobBoard, type JobFunnelRow } from '@shared/domain/jobs'
import { PALETTE } from '@shared/colors'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useApi, useApiMutation, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { fmtPercent, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, Field, Page, PageBody, PageHeader } from '@/components/common/page'
import { CardSkeleton, Delayed } from '@/components/common/page-skeleton'
import { NumberInput } from '@/components/common/number-input'
import { LinkInput } from '@/components/common/text-field'
import { ColorSwatches } from '@/components/common/color-swatches'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { SubmitButton } from '@/components/common/submit-button'
import { useFormGate } from '@/hooks/use-form-gate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WEEKDAYS } from './labels'
import { BoardDot } from './board-label'
import { SORTABLE_TRANSITION } from '@/lib/motion'

const LIMITS = limitsOf(jobBoardInputSchema)
const RANGES = rangesOf(jobBoardInputSchema)
/** The palette of tags and events: a board colour is always a named swatch. */
const COLORS: readonly string[] = PALETTE

function BoardCard({ board, stats }: { board: JobBoard; stats?: JobFunnelRow }): ReactElement {
  const update = useApiMutation('jobs', 'updateBoard')
  // A board with applications is refused by main with a toast: it is switched off instead.
  const remove = useApiMutation('jobs', 'removeBoard', { successMessage: 'Сайт видалено' })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: board.id,
    transition: SORTABLE_TRANSITION
  })
  const save = (patch: Partial<JobBoard>): void => update.mutate({ id: board.id, patch })
  // Seeded or older boards may carry a colour outside the palette: show it first and selected.
  const custom = !!board.color && !COLORS.includes(board.color)
  const palette = custom ? [board.color!, ...COLORS] : COLORS

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('gap-0 py-4', isDragging && 'z-10 shadow-lg')}
    >
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-grab text-muted-foreground"
            aria-label="Перетягнути"
            {...attributes}
            {...listeners}
          >
            <GripVertical />
          </Button>
          {/* A switched-off board says so in words: fading the whole card dropped labels below 4.5:1. */}
          <BoardDot color={board.color} size="md" className={cn(!board.active && 'opacity-40')} />
          <Input
            key={`name-${board.id}-${board.name}`}
            defaultValue={board.name}
            aria-label="Назва сайту"
            maxLength={LIMITS.name}
            className="font-display h-10 max-w-xs bg-transparent text-heading"
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value !== board.name &&
              save({ name: e.target.value.trim() })
            }
          />
          <div className="ml-auto flex items-center gap-2">
            {/* A mark, not a counter: outline, unlike the stats badge next to it. */}
            {!board.active && <Badge variant="outline">Вимкнено</Badge>}
            {stats && (
              <Badge variant="soft" className="bg-card font-normal">
                {stats.applied} {plural(stats.applied, ['відгук', 'відгуки', 'відгуків'])},{' '}
                {fmtPercent(stats.replyRate)} відповідей
              </Badge>
            )}
            <label className="flex items-center gap-2 text-caption text-muted-foreground">
              Активний
              <Switch checked={board.active} onCheckedChange={(active) => save({ active })} />
            </label>
            <Confirm
              title={`Видалити «${board.name}»?`}
              description="Сайт без відгуків буде видалено. Відновити не можна."
              confirmLabel="Видалити"
              onConfirm={() => remove.mutate(board.id)}
            >
              <IconAction label="Видалити сайт">
                <Trash2 />
              </IconAction>
            </Confirm>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_200px] gap-4">
          <Field label="Посилання">
            <LinkInput
              value={board.url}
              onSave={(url) => save({ url })}
              placeholder="https://djinni.co/jobs/?primary_keyword=React"
              maxLength={LIMITS.url}
              openLabel={`Відкрити ${board.name}`}
            />
          </Field>
          <Field label="Відгуків на день">
            <NumberInput
              integer
              {...RANGES.dailyTarget}
              value={board.dailyTarget}
              onChange={(v) => v !== null && v !== board.dailyTarget && save({ dailyTarget: v })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Field label="Дні" className="w-auto">
            {/* The track is a tint: bg-surface of the segment merged with this surface card. */}
            <ToggleGroup
              type="multiple"
              variant="segment"
              size="sm"
              className="data-[variant=segment]:bg-foreground/6"
              value={board.weekdays.map(String)}
              onValueChange={(v) => save({ weekdays: v.map(Number) })}
            >
              {WEEKDAYS.map((d) => (
                <ToggleGroupItem key={d.value} value={String(d.value)} aria-label={d.label}>
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          {/* Label pinned right like the swatches, so it doesn't move with their count. */}
          <Field label="Колір" className="w-auto [&>*:first-child]:justify-end">
            <ColorSwatches
              colors={palette}
              value={board.color}
              onChange={(c) => c && save({ color: c })}
              names={custom ? { [board.color!]: 'Поточний колір' } : undefined}
              label="Колір сайту"
            />
          </Field>
        </div>
      </CardContent>
    </Card>
  )
}

/** One empty list for every render while loading: the local drag order compares the array itself. */
const NO_BOARDS: JobBoard[] = []

/** Job boards: where to look every day, with daily targets and weekdays. */
export function JobBoardsPage(): ReactElement {
  const query = useInPlaceApi('jobs', 'boards', { includeInactive: true })
  const { data: boards = NO_BOARDS, isLoading } = query
  // All time, the same query as the board chips on «Вакансії»: one board, one number on both screens.
  const { data: stats } = useApi('jobs', 'stats', { from: 0 })
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  // The name is required: «Додати сайт» is off while it is empty, Enter adds nothing (useFormGate).
  const { attach, reason, submit: gate } = useFormGate()
  const create = useApiMutation('jobs', 'createBoard', {
    successMessage: 'Сайт додано',
    onSuccess: () => setName('')
  })
  const reorder = useApiMutation('jobs', 'reorderBoards')
  // The dropped order stays until the server's list comes back (adjusting state while rendering): dropping it when
  // the request settled showed the old order for a few frames before the refetch — the card jumped back and forth.
  const [order, setOrder] = useState<string[] | null>(null)
  const [orderOf, setOrderOf] = useState(boards)
  if (boards !== orderOf) {
    setOrderOf(boards)
    setOrder(null)
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const sorted = order
    ? order.map((id) => boards.find((b) => b.id === id)).filter((b): b is JobBoard => !!b)
    : boards
  const byBoard = new Map((stats?.byBoard ?? []).map((r) => [r.key, r]))

  const onDragEnd = (e: DragEndEvent): void => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = sorted.map((b) => b.id)
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    setOrder(next)
    reorder.mutate(next, { onError: () => setOrder(null) })
  }

  return (
    <Page>
      <PageHeader
        title="Сайти вакансій"
        subtitle="Де шукати щодня. Норма зараховується за відгуками з сайту; якщо вакансій немає — закрийте день позначкою на огляді."
        actions={
          <form
            ref={attach}
            className="flex gap-2"
            onSubmit={(e) =>
              gate(e, () => {
                if (create.isPending) return
                create.mutate({ name: name.trim(), color: COLORS[boards.length % COLORS.length] })
              })
            }
          >
            <Input
              ref={nameRef}
              // N puts the cursor here: «Додати сайт» is off while the name is empty.
              data-page-new
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Новий сайт, напр. Djinni"
              aria-label="Назва нового сайту"
              className="w-64"
              maxLength={LIMITS.name}
            />
            {/* Off with the reason while the name is empty; on, it says what comes after adding. */}
            {reason ? (
              <SubmitButton variant="lime" reason={reason}>
                <Plus /> Додати сайт
              </SubmitButton>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="submit" variant="lime" disabled={create.isPending}>
                    <Plus /> Додати сайт
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Посилання, норму й дні можна задати після додавання</TooltipContent>
              </Tooltip>
            )}
          </form>
        }
      />
      <PageBody>
        <div className="flex w-full max-w-4xl flex-col gap-3">
          {query.failed ? (
            <LoadError title="Не вдалося завантажити сайти" onRetry={query.retry} />
          ) : isLoading ? (
            <Delayed delay={150}>
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <CardSkeleton key={i} height={220} />
                ))}
              </div>
            </Delayed>
          ) : boards.length === 0 ? (
            <EmptyState
              illustration="explorer"
              title="Сайтів поки немає"
              hint="Впишіть назву вгорі — Djinni, DOU, LinkedIn — і задайте норму відгуків на день."
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={sorted.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-3">
                  {sorted.map((b) => (
                    <BoardCard key={b.id} board={b} stats={byBoard.get(b.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <p className="text-caption text-muted-foreground">
            Норма 0 — просто зайти й перевірити. Вимкнений сайт зникає з огляду, але його
            історія й статистика зберігаються. Сайт із відгуками не видаляється — вимкніть
            його.
          </p>
        </div>
      </PageBody>
    </Page>
  )
}
