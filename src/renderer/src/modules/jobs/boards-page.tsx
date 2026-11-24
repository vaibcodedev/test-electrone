import { useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, GripVertical, Plus } from 'lucide-react'
import type { JobBoard, JobFunnelRow } from '@shared/domain/jobs'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { TAG_COLORS } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WEEKDAYS } from './j2-labels'

function BoardCard({ board, stats }: { board: JobBoard; stats?: JobFunnelRow }) {
  const update = useApiMutation('jobs', 'updateBoard')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id })
  const save = (patch: Partial<JobBoard>): void => update.mutate({ id: board.id, patch })

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('gap-0 py-4', isDragging && 'z-10 shadow-lg', !board.active && 'opacity-60')}
    >
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" className="cursor-grab text-muted-foreground" aria-label="Перетащить" {...attributes} {...listeners}>
            <GripVertical />
          </Button>
          <span className="size-3 shrink-0 rounded-full" style={{ background: board.color ?? 'var(--muted-foreground)' }} />
          <Input
            key={`name-${board.id}-${board.name}`}
            defaultValue={board.name}
            aria-label="Название площадки"
            className="font-display h-10 max-w-xs bg-transparent text-[18px]"
            onBlur={(e) => e.target.value.trim() && e.target.value !== board.name && save({ name: e.target.value.trim() })}
          />
          <div className="ml-auto flex items-center gap-2">
            {stats && (
              <Badge variant="soft" className="bg-card font-normal">
                {stats.applied} откл. · ответы {stats.replyRate}% · офферы {stats.offer}
              </Badge>
            )}
            <label className="flex items-center gap-2 text-caption text-muted-foreground">
              Активна
              <Switch checked={board.active} onCheckedChange={(active) => save({ active })} />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_160px] gap-4">
          <Field className="gap-2">
            <FieldLabel>Ссылка</FieldLabel>
            <InputGroup className="bg-card">
              <InputGroupInput
                key={`url-${board.id}-${board.url}`}
                defaultValue={board.url}
                placeholder="https://djinni.co/jobs/?primary_keyword=React"
                onBlur={(e) => e.target.value !== board.url && save({ url: e.target.value.trim() })}
              />
              {board.url && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" className="rounded-full" aria-label="Открыть" onClick={() => api.app.openExternal(board.url)}>
                    <ExternalLink />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </Field>
          <Field className="gap-2">
            <FieldLabel>Откликов в день</FieldLabel>
            <Input
              key={`t-${board.id}-${board.dailyTarget}`}
              type="number"
              min={0}
              max={100}
              defaultValue={board.dailyTarget}
              className="bg-card"
              onBlur={(e) => {
                const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)))
                if (v !== board.dailyTarget) save({ dailyTarget: v })
              }}
            />
          </Field>
        </div>
        <p className="-mt-2 text-meta text-muted-foreground">0 — просто зайти и проверить, день закрывается галочкой.</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field className="w-auto gap-2">
            <FieldLabel>Дни</FieldLabel>
            <ToggleGroup
              type="multiple"
              variant="chip"
              size="xs"
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
          <Field className="w-auto gap-2">
            <FieldLabel>Цвет</FieldLabel>
            <ToggleGroup type="single" value={board.color ?? ''} onValueChange={(c) => c && save({ color: c })} spacing={1}>
              {TAG_COLORS.map((c) => (
                <ToggleGroupItem
                  key={c}
                  value={c}
                  aria-label={c}
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
  const { data: boards = [] } = useApi('jobs', 'boards', { includeInactive: true })
  const { data: stats } = useApi('jobs', 'stats', {})
  const create = useApiMutation('jobs', 'createBoard', { successMessage: 'Площадка добавлена' })
  const reorder = useApiMutation('jobs', 'reorderBoards')
  const [name, setName] = useState('')
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
        title="Площадки"
        subtitle="Где искать каждый день. Норма засчитывается по откликам с площадки; если вакансий нет — закройте день галочкой на обзоре."
      />
      <PageBody className="flex max-w-4xl flex-col gap-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            create.mutate({ name: name.trim(), color: TAG_COLORS[boards.length % TAG_COLORS.length] }, { onSuccess: () => setName('') })
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая площадка: Djinni, DOU, LinkedIn…" className="max-w-sm" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" variant="lime" disabled={!name.trim()}>
                <Plus /> Добавить
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ссылку, норму и дни можно задать после добавления</TooltipContent>
          </Tooltip>
        </form>
        {boards.length === 0 ? (
          <EmptyState title="Площадок нет" hint="Добавьте сайты с вакансиями, на которые заходите каждый день." />
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
          Отключённая площадка пропадает с обзора, но её история и статистика сохраняются.
        </p>
      </PageBody>
    </Page>
  )
}
