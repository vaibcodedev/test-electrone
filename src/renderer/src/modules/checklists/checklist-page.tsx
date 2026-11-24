import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, GripVertical, Plus, RotateCcw, Rocket, Trash2 } from 'lucide-react'
import type { ChecklistItem, ChecklistPatch } from '@shared/domain/checklists'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState, SegmentBar } from '@/components/common/page'
import { EntityAside, InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/common/master-detail'
import { cn } from '@/lib/utils'
import { LaunchDialog } from './launch-dialog'

const NO_SECTION = 'Без раздела'

/** Groups items by section, keeping the order in which sections first appear. */
function groupBySection(items: ChecklistItem[]): [string, ChecklistItem[]][] {
  const map = new Map<string, ChecklistItem[]>()
  for (const item of items) map.set(item.section, [...(map.get(item.section) ?? []), item])
  return [...map.entries()]
}

function ItemRow({ item, isRun }: { item: ChecklistItem; isRun: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  })
  const update = useApiMutation('checklists', 'updateItem')
  const remove = useApiMutation('checklists', 'removeItem')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const [hint, setHint] = useState(item.hint)

  useEffect(() => {
    if (!editing) {
      setText(item.text)
      setHint(item.hint)
    }
  }, [item.text, item.hint, editing])

  const save = (): void => {
    setEditing(false)
    if (text.trim() && (text.trim() !== item.text || hint !== item.hint)) {
      update.mutate({ id: item.id, patch: { text: text.trim(), hint } })
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-start gap-3 rounded-2xl px-2 py-2 hover:bg-surface',
        isDragging && 'z-10 bg-card shadow-lg ring-1 ring-border'
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Перетащить"
      >
        <GripVertical />
      </Button>
      {isRun ? (
        <Checkbox
          checked={item.done}
          onCheckedChange={(v) => update.mutate({ id: item.id, patch: { done: v === true } })}
          aria-label={item.text}
          className="mt-0.5 size-[22px] rounded-full border-input bg-card data-[state=checked]:border-lime data-[state=checked]:bg-lime data-[state=checked]:text-lime-foreground"
        />
      ) : (
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') {
                  setText(item.text)
                  setHint(item.hint)
                  setEditing(false)
                }
              }}
            />
            <Input
              value={hint}
              placeholder="Подсказка (необязательно)"
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              onBlur={(e) => {
                if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) save()
              }}
              className="text-caption"
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setEditing(true)}
            className="h-auto w-full flex-col items-start gap-0 rounded-lg p-0 text-left font-normal whitespace-normal hover:bg-transparent"
            title="Нажмите, чтобы изменить"
          >
            <span
              className={cn(
                'text-lead leading-snug',
                item.done && isRun && 'text-muted-foreground line-through'
              )}
            >
              {item.text}
            </span>
            {item.hint && (
              <span className="mt-0.5 block text-caption text-muted-foreground">{item.hint}</span>
            )}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Удалить пункт"
        onClick={() => remove.mutate(item.id)}
        className="mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </li>
  )
}

function AddItem({
  checklistId,
  section,
  sections
}: {
  checklistId: string
  section?: string
  sections?: string[]
}) {
  const [text, setText] = useState('')
  const [newSection, setNewSection] = useState('')
  const add = useApiMutation('checklists', 'addItem', { onSuccess: () => setText('') })
  const listId = `sections-${checklistId}`
  return (
    <form
      className={cn(
        'flex items-center gap-2',
        section === undefined && 'rounded-2xl bg-surface p-2'
      )}
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        add.mutate({ checklistId, text: text.trim(), section: section ?? newSection.trim() })
      }}
    >
      <Plus
        className={cn(
          'size-4 shrink-0 text-muted-foreground',
          section === undefined ? 'ml-2' : 'ml-[34px]'
        )}
      />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={section === undefined ? 'Новый пункт' : 'Добавить пункт'}
        className="min-w-0 flex-1 border-0 bg-transparent px-1 text-body shadow-none focus-visible:bg-transparent focus-visible:ring-0"
      />
      {section === undefined && (
        <>
          <Input
            list={listId}
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Раздел"
            className="w-48 bg-card"
          />
          <datalist id={listId}>
            {sections?.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button type="submit" variant="lime" size="sm" disabled={!text.trim()}>
            Добавить
          </Button>
        </>
      )}
    </form>
  )
}

export function ChecklistPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('checklists', 'get', id)
  const update = useApiMutation('checklists', 'update')
  const reorder = useApiMutation('checklists', 'reorderItems')
  const updateItem = useApiMutation('checklists', 'updateItem')
  const reset = useApiMutation('checklists', 'reset', { successMessage: 'Отметки сняты' })
  const remove = useApiMutation('checklists', 'remove', {
    successMessage: 'Чек-лист в корзине',
    onSuccess: () => navigate(data?.kind === 'run' ? '/checklists?tab=runs' : '/checklists')
  })
  const [launchOpen, setLaunchOpen] = useState(false)
  const patch = (p: ChecklistPatch): void => update.mutate({ id, patch: p })
  const [title, setTitle] = useAutosave(
    data?.title ?? '',
    (t) => t.trim() && patch({ title: t.trim() })
  )
  const [description, setDescription] = useAutosave(data?.description ?? '', (d) =>
    patch({ description: d })
  )

  // Local order for instant drag feedback; follows server data otherwise.
  const [items, setItems] = useState<ChecklistItem[]>([])
  useEffect(() => setItems(data?.items ?? []), [data?.items])
  const groups = useMemo(() => groupBySection(items), [items])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  if (isLoading) return null
  if (!data) {
    return (
      <EmptyState
        title="Чек-лист не найден"
        hint="Возможно, он в корзине."
        action={<Button onClick={() => navigate('/checklists')}>К чек-листам</Button>}
      />
    )
  }

  const isRun = data.kind === 'run'
  const done = items.filter((i) => i.done).length

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from < 0 || to < 0) return
    const moved = items[from]
    const target = items[to]
    let next = arrayMove(items, from, to)
    if (moved.section !== target.section) {
      next = next.map((i) => (i.id === moved.id ? { ...i, section: target.section } : i))
      updateItem.mutate({ id: moved.id, patch: { section: target.section } })
    }
    // Keep items of one section contiguous, in the order sections appear.
    const ordered = groupBySection(next).flatMap(([, list]) => list)
    setItems(ordered)
    reorder.mutate({ checklistId: id, ids: ordered.map((i) => i.id) })
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10" key={data.id}>
        <Link
          to={isRun ? '/checklists?tab=runs' : '/checklists'}
          className="mb-4 flex w-fit items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {isRun ? 'Прогоны' : 'Шаблоны'}
        </Link>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <Badge variant={isRun ? 'ink' : 'soft'} className="mb-2">
              {isRun ? 'Прогон' : 'Шаблон'}
            </Badge>
            <InlineTitle value={title} onChange={setTitle} className="text-[38px]" />
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-7">
            {isRun ? (
              <Confirm
                title="Снять все отметки?"
                description="Все пункты снова станут невыполненными."
                confirmLabel="Сбросить"
                onConfirm={() => reset.mutate(id)}
              >
                <Button variant="soft">
                  <RotateCcw /> Сбросить
                </Button>
              </Confirm>
            ) : (
              <Button variant="lime" onClick={() => setLaunchOpen(true)}>
                <Rocket /> Запустить прогон
              </Button>
            )}
            <PinButtons entity={{ type: 'checklist', id }} />
            <Confirm
              title="Удалить чек-лист?"
              description="Он уйдёт в корзину на 30 дней."
              onConfirm={() => remove.mutate(id)}
            >
              <Button variant="ghost" size="icon-sm" aria-label="В корзину">
                <Trash2 />
              </Button>
            </Confirm>
          </div>
        </div>

        {isRun && (
          <Card
            className={cn(
              'mt-5 flex-row items-center gap-5 p-5',
              done === items.length && items.length
                ? 'bg-lime text-lime-foreground'
                : 'bg-ink text-ink-foreground'
            )}
          >
            <span className="font-display text-[40px] leading-none tabular-nums">
              {done}
              <span className="opacity-50">/{items.length}</span>
            </span>
            <SegmentBar
              value={done}
              total={Math.max(1, items.length)}
              segments={Math.min(12, Math.max(4, items.length))}
              tone={done === items.length && items.length ? 'ink' : 'lime'}
              className="flex-1"
            />
            <span className="text-body tabular-nums opacity-75">
              {items.length ? Math.round((done / items.length) * 100) : 0}%
            </span>
          </Card>
        )}

        <div className="mt-5">
          <MarkdownField
            value={description}
            onChange={setDescription}
            placeholder="Когда и зачем использовать этот чек-лист"
            minHeight="100px"
          />
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="mt-8 flex flex-col gap-7">
              {groups.map(([section, list]) => {
                const sectionDone = list.filter((i) => i.done).length
                return (
                  <section key={section || NO_SECTION}>
                    <div className="mb-1.5 flex items-baseline justify-between px-2">
                      <h2 className="font-display text-[19px]">{section || NO_SECTION}</h2>
                      {isRun && (
                        <span className="text-caption text-muted-foreground tabular-nums">
                          {sectionDone}/{list.length}
                        </span>
                      )}
                    </div>
                    <ul className="flex flex-col">
                      {list.map((item) => (
                        <ItemRow key={item.id} item={item} isRun={isRun} />
                      ))}
                    </ul>
                    <AddItem checklistId={id} section={section} />
                  </section>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>

        <div className="mt-6">
          <AddItem checklistId={id} sections={groups.map(([s]) => s).filter(Boolean)} />
        </div>
      </div>

      <aside
        className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-6"
        key={`aside-${data.id}`}
      >
        <EntityAside
          entity={{ type: 'checklist', id: data.id }}
          tags={data.tags}
          onTagsChange={(tagIds) => patch({ tagIds })}
          createdAt={data.createdAt}
          updatedAt={data.updatedAt}
        >
          {isRun && data.templateId && (
            <section className="flex flex-col gap-1">
              <SectionLabel>Шаблон</SectionLabel>
              <Button variant="link" size="sm" asChild className="w-fit">
                <Link to={`/checklists/${data.templateId}`}>Открыть исходный шаблон</Link>
              </Button>
            </section>
          )}
        </EntityAside>
      </aside>
      <LaunchDialog
        template={isRun ? null : { id: data.id, title: data.title }}
        open={launchOpen}
        onOpenChange={setLaunchOpen}
      />
    </div>
  )
}
