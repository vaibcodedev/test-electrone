import { useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import { jobBoardInputSchema, type JobBoard, type JobFunnelRow } from '@shared/domain/jobs'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtPercent, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, Field, Page, PageBody, PageHeader } from '@/components/common/page'
import { CardSkeleton, Delayed } from '@/components/common/page-skeleton'
import { NumberInput } from '@/components/common/number-input'
import { LinkInput } from '@/components/common/text-field'
import { TAG_COLORS } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WEEKDAYS } from './labels'
import { BoardDot } from './board-label'

const LIMITS = limitsOf(jobBoardInputSchema)
const RANGES = rangesOf(jobBoardInputSchema)

function BoardCard({ board, stats }: { board: JobBoard; stats?: JobFunnelRow }) {
  const update = useApiMutation('jobs', 'updateBoard')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id })
  const save = (patch: Partial<JobBoard>): void => update.mutate({ id: board.id, patch })
  // Seeded or older boards may carry a colour outside the palette: show it first and selected.
  const custom = !!board.color && !TAG_COLORS.includes(board.color)
  const palette = custom ? [board.color!, ...TAG_COLORS] : TAG_COLORS

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('gap-0 py-4', isDragging && 'z-10 shadow-lg', !board.active && 'opacity-60')}
    >
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" className="cursor-grab text-muted-foreground" aria-label="Перетягнути" {...attributes} {...listeners}>
            <GripVertical />
          </Button>
          <BoardDot color={board.color} size="md" />
          <Input
            key={`name-${board.id}-${board.name}`}
            defaultValue={board.name}
            aria-label="Назва майданчика"
            maxLength={LIMITS.name}
            className="font-display h-10 max-w-xs bg-transparent text-heading"
            onBlur={(e) => e.target.value.trim() && e.target.value !== board.name && save({ name: e.target.value.trim() })}
          />
          <div className="ml-auto flex items-center gap-2">
            {stats && (
              <Badge variant="soft" className="bg-card font-normal">
                {stats.applied} {plural(stats.applied, ['відгук', 'відгуки', 'відгуків'])}, {fmtPercent(stats.replyRate)} відповідей
              </Badge>
            )}
            <label className="flex items-center gap-2 text-caption text-muted-foreground">
              Активний
              <Switch checked={board.active} onCheckedChange={(active) => save({ active })} />
            </label>
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
          <Field label="Відгуків на день" hint="0 — просто зайти й перевірити">
            <NumberInput
              integer
              {...RANGES.dailyTarget}
              value={board.dailyTarget}
              onChange={(v) => v !== null && v !== board.dailyTarget && save({ dailyTarget: v })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field label="Дні" className="w-auto">
            <ToggleGroup
              type="multiple"
              variant="segment"
              size="sm"
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
          <Field label="Колір" className="w-auto">
            <ToggleGroup type="single" value={board.color ?? ''} onValueChange={(c) => c && save({ color: c })} spacing={1}>
              {palette.map((c, i) => (
                <ToggleGroupItem
                  key={c}
                  value={c}
                  aria-label={custom && i === 0 ? 'Поточний колір' : `Колір ${custom ? i : i + 1}`}
                  className="size-6 min-w-6 rounded-full p-0 ring-offset-2 ring-offset-surface on:ring-2 on:ring-foreground"
                  style={{ background: c }}
                />
              ))}
            </ToggleGroup>
          </Field>
        </div>
      </CardContent>
    </Card>
  )
}

/** Job boards: where to look every day, with daily targets and weekdays. */
export function JobBoardsPage() {
  const { data: boards = [], isLoading } = useApi('jobs', 'boards', { includeInactive: true })
  const { data: stats } = useApi('jobs', 'stats', {})
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const create = useApiMutation('jobs', 'createBoard', { successMessage: 'Майданчик додано', onSuccess: () => setName('') })
  const reorder = useApiMutation('jobs', 'reorderBoards')
  const [order, setOrder] = useState<string[] | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const sorted = order ? order.map((id) => boards.find((b) => b.id === id)).filter((b): b is JobBoard => !!b) : boards
  const byBoard = new Map((stats?.byBoard ?? []).map((r) => [r.key, r]))

  const onDragEnd = (e: DragEndEvent): void => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = sorted.map((b) => b.id)
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    setOrder(next)
    reorder.mutate(next, { onSettled: () => setOrder(null) })
  }

  return (
    <Page>
      <PageHeader
        title="Майданчики"
        subtitle="Де шукати щодня. Норма зараховується за відгуками з майданчика; якщо вакансій немає — закрийте день позначкою на огляді."
        actions={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (create.isPending) return
              // Empty name (e.g. the N key pressed the button): put the cursor where the name goes.
              if (!name.trim()) return nameRef.current?.focus()
              create.mutate({ name: name.trim(), color: TAG_COLORS[boards.length % TAG_COLORS.length] })
            }}
          >
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Djinni, DOU, LinkedIn…"
              aria-label="Назва нового майданчика"
              className="w-64"
              maxLength={LIMITS.name}
            />
            {/* Lime = the N key, so it stays enabled while the name is empty: then it focuses the field. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="submit" variant="lime" disabled={create.isPending}>
                  <Plus /> Додати майданчик
                </Button>
              </TooltipTrigger>
              <TooltipContent>Посилання, норму й дні можна задати після додавання</TooltipContent>
            </Tooltip>
          </form>
        }
      />
      <PageBody>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          {isLoading ? (
            <Delayed delay={150}>
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <CardSkeleton key={i} height={220} />
                ))}
              </div>
            </Delayed>
          ) : boards.length === 0 ? (
            <EmptyState title="Майданчиків немає" hint="Впишіть назву вгорі — Djinni, DOU, LinkedIn — і задайте норму відгуків на день." />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sorted.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {sorted.map((b) => (
                    <BoardCard key={b.id} board={b} stats={byBoard.get(b.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <p className="text-caption text-muted-foreground">
            Вимкнений майданчик зникає з огляду, але його історія й статистика зберігаються.
          </p>
        </div>
      </PageBody>
    </Page>
  )
}
