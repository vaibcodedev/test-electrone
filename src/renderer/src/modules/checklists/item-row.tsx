import { useState, type ReactElement } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import type { ChecklistItem } from '@shared/domain/checklists'
import { useApiMutation } from '@/lib/query'
import { useReadOnly } from '@/components/common/detail-mode'
import { IconAction } from '@/components/common/icon-action'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ITEM_LIMITS } from './use-checklist-order'

/** Hidden until the row is hovered, but visible as soon as the keyboard reaches it (WCAG 2.4.7). */
const ROW_ACTION = 'text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'

/** One checklist item: a tickable step in a run, a plain step in a template; text and hint editable in place. */
export function ItemRow({ item, isRun }: { item: ChecklistItem; isRun: boolean }): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  })
  const readOnly = useReadOnly()
  const update = useApiMutation('checklists', 'updateItem')
  const remove = useApiMutation('checklists', 'removeItem')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const [hint, setHint] = useState(item.hint)

  /** Starts from the current server text: it may have changed since the last edit. */
  const startEditing = (): void => {
    setText(item.text)
    setHint(item.hint)
    setEditing(true)
  }

  const save = (): void => {
    setEditing(false)
    if (text.trim() && (text.trim() !== item.text || hint !== item.hint)) {
      update.mutate({ id: item.id, patch: { text: text.trim(), hint } })
    }
  }

  const label = (
    <>
      <span className={cn('text-lead leading-snug', item.done && isRun && 'text-muted-foreground')}>{item.text}</span>
      {item.hint && <span className="mt-0.5 block text-caption text-muted-foreground">{item.hint}</span>}
    </>
  )

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
        data-edit-only
        {...attributes}
        {...listeners}
        className={cn('mt-0.5 cursor-grab active:cursor-grabbing', ROW_ACTION)}
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
        {readOnly ? (
          <div className="flex flex-col">{label}</div>
        ) : editing ? (
          <div
            className="flex flex-col gap-1.5"
            // Leaving the pair of fields (not moving between them) saves, like Enter does.
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) save()
            }}
          >
            <Input
              autoFocus
              value={text}
              maxLength={ITEM_LIMITS.text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <Input
              value={hint}
              maxLength={ITEM_LIMITS.hint}
              placeholder="Підказка (необовʼязково)"
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="text-caption"
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={startEditing}
            className="h-auto w-full flex-col items-start gap-0 rounded-lg p-0 text-left font-normal whitespace-normal hover:bg-transparent"
            title="Натисніть, щоб змінити"
          >
            {label}
          </Button>
        )}
      </div>
      <IconAction
        label="Видалити пункт"
        data-edit-only
        onClick={() => remove.mutate(item.id)}
        className={cn('mt-0.5 hover:text-destructive', ROW_ACTION)}
      >
        <Trash2 />
      </IconAction>
    </li>
  )
}
