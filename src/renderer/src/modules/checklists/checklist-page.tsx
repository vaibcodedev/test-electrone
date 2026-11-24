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
import { ArrowLeft, GripVertical, Plus, RotateCcw, Rocket, Trash2, X } from 'lucide-react'
import { checklistInputSchema, checklistItemInputSchema, type ChecklistItem, type ChecklistPatch } from '@shared/domain/checklists'
import { limitsOf } from '@/lib/limits'
import { invalidateAll, useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState, SegmentBar } from '@/components/common/page'
import { EntityAside, InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { CopyJsonButton } from '@/components/common/import-dialog'
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

const LIMITS = limitsOf(checklistInputSchema)
const ITEM_LIMITS = limitsOf(checklistItemInputSchema)

const NO_SECTION = 'Без розділу'

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
        aria-label="Перетягнути"
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
              maxLength={ITEM_LIMITS.text}
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
              maxLength={ITEM_LIMITS.hint}
              placeholder="Підказка (необовʼязково)"
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
            title="Натисніть, щоб змінити"
          >
            <span
              className={cn(
                'text-lead leading-snug',
                item.done && isRun && 'text-muted-foreground'
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
        aria-label="Видалити пункт"
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
        maxLength={ITEM_LIMITS.text}
        onChange={(e) => setText(e.target.value)}
        placeholder={section === undefined ? 'Новий пункт' : 'Додати пункт'}
        className="min-w-0 flex-1 border-0 bg-transparent px-1 text-body shadow-none focus-visible:bg-transparent focus-visible:ring-0"
      />
      {section === undefined && (
        <>
          <Input
            list={listId}
            value={newSection}
            maxLength={ITEM_LIMITS.section}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Розділ"
            className="w-48 bg-card"
          />
          <datalist id={listId}>
            {sections?.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button type="submit" variant="lime" size="sm" disabled={!text.trim()}>
            Додати
          </Button>
        </>
      )}
    </form>
  )
}

/**
 * Section heading, renamable in place. Renaming «Без розділу» moves those items into a real section.
 * Saves on blur / Enter; Esc restores.
 */
function SectionTitle({ checklistId, section, items }: { checklistId: string; section: string; items: ChecklistItem[] }) {
  const [value, setValue] = useState(section)
  useEffect(() => setValue(section), [section])
  const commit = async (): Promise<void> => {
    const next = value.trim()
    if (next === section) return
    try {
      await Promise.all(items.map((it) => api.checklists.updateItem({ id: it.id, patch: { section: next } })))
      invalidateAll()
      toast.success(next ? `Розділ «${next}»` : 'Пункти без розділу')
    } catch (e) {
      toast.error((e as Error).message)
      setValue(section)
    }
  }
  return (
    <Input
      value={value}
      placeholder={NO_SECTION}
      aria-label={`Назва розділу ${section || NO_SECTION}`}
      title="Натисніть, щоб перейменувати розділ"
      maxLength={ITEM_LIMITS.section}
      data-checklist={checklistId}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setValue(section)
      }}
      className="font-display h-auto max-w-sm border-transparent bg-transparent px-1 py-0.5 text-[19px] placeholder:text-foreground hover:border-input focus-visible:bg-foreground/[0.04]"
    />
  )
}

export function ChecklistPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('checklists', 'get', id)
  const update = useApiMutation('checklists', 'update')
  const reorder = useApiMutation('checklists', 'reorderItems')
  const updateItem = useApiMutation('checklists', 'updateItem')
  const reset = useApiMutation('checklists', 'reset', { successMessage: 'Позначки знято' })
  const remove = useApiMutation('checklists', 'remove', {
    successMessage: 'Чек-лист переміщено в кошик',
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
  const [draftSections, setDraftSections] = useState<string[]>([])
  const [sectionName, setSectionName] = useState('')
  const groups = useMemo(() => groupBySection(items), [items])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  if (isLoading) return null
  if (!data) {
    return (
      <EmptyState
        title="Чек-лист не знайдено"
        hint="Можливо, він у кошику."
        action={<Button onClick={() => navigate('/checklists')}>До чек-листів</Button>}
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
          <ArrowLeft className="size-3.5" /> {isRun ? 'Прогони' : 'Шаблони'}
        </Link>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <Badge variant={isRun ? 'ink' : 'soft'} className="mb-2">
              {isRun ? 'Прогін' : 'Шаблон'}
            </Badge>
            <InlineTitle value={title} onChange={setTitle} maxLength={LIMITS.title} className="text-[38px]" />
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-7">
            {isRun ? (
              <Confirm
                title="Зняти всі позначки?"
                description="Усі пункти знову стануть невиконаними."
                confirmLabel="Скинути"
                onConfirm={() => reset.mutate(id)}
              >
                <Button variant="soft">
                  <RotateCcw /> Скинути
                </Button>
              </Confirm>
            ) : (
              <Button variant="lime" onClick={() => setLaunchOpen(true)}>
                <Rocket /> Запустити прогін
              </Button>
            )}
            <CopyJsonButton
              what="Чек-лист"
              getData={() => ({
                title: data.title,
                description: data.description,
                sections: groups.map(([section, list]) => ({
                  title: section,
                  items: list.map((i) => (i.hint ? { text: i.text, hint: i.hint } : i.text))
                }))
              })}
            />
            <PinButtons entity={{ type: 'checklist', id }} />
            <Confirm
              title="Видалити чек-лист?"
              description="Він піде в кошик на 30 днів."
              onConfirm={() => remove.mutate(id)}
            >
              <Button variant="ghost" size="icon-sm" aria-label="У кошик">
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
            placeholder="Коли й навіщо використовувати цей чек-лист"
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
                      <SectionTitle checklistId={id} section={section} items={list} />
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

        {/* Empty checklist: a field for the first item. New sections: «+ Розділ» → an empty section with its own adder. */}
        {groups.length === 0 && draftSections.length === 0 && (
          <div className="mt-6">
            <AddItem checklistId={id} section="" />
          </div>
        )}
        {draftSections
          .filter((name) => !groups.some(([s]) => s === name))
          .map((name) => (
            <section key={`draft-${name}`} className="mt-7">
              <div className="mb-1.5 flex items-center justify-between px-2">
                <h2 className="font-display text-[19px]">{name}</h2>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Прибрати розділ ${name}`}
                  onClick={() => setDraftSections((d) => d.filter((x) => x !== name))}
                >
                  <X />
                </Button>
              </div>
              <AddItem checklistId={id} section={name} />
            </section>
          ))}
        <form
          className="mt-6 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const name = sectionName.trim()
            if (!name) return
            if (!groups.some(([s]) => s === name) && !draftSections.includes(name)) setDraftSections((d) => [...d, name])
            setSectionName('')
          }}
        >
          <Input
            value={sectionName}
            maxLength={ITEM_LIMITS.section}
            onChange={(e) => setSectionName(e.target.value)}
            placeholder="Назва нового розділу, напр. «Перед релізом»"
            className="max-w-sm"
            aria-label="Назва нового розділу"
          />
          <Button type="submit" variant="subtle" disabled={!sectionName.trim()}>
            <Plus /> Розділ
          </Button>
        </form>
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
                <Link to={`/checklists/${data.templateId}`}>Відкрити вихідний шаблон</Link>
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
