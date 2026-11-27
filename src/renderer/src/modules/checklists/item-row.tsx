import { useId, useState, type ReactElement } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ChecklistItem } from '@shared/domain/checklists'
import { useApiMutation } from '@/lib/query'
import { useReadOnly } from '@/components/common/detail-mode'
import { IconAction } from '@/components/common/icon-action'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ITEM_LIMITS } from './use-checklist-order'
import { SORTABLE_TRANSITION } from '@/lib/motion'
import { RecordMenu } from '@/features/record-menu/record-menu'
import { checklistItemMenu } from './menu'

/** The drag handle: hidden until the row is hovered, but visible as soon as the keyboard reaches it (WCAG 2.4.7). */
const ROW_ACTION =
  'text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'

/** One checklist item: a tickable step in a run, a plain step in a template; text and hint editable in place. */
export function ItemRow({ item, isRun }: { item: ChecklistItem; isRun: boolean }): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    transition: SORTABLE_TRANSITION
  })
  const readOnly = useReadOnly()
  const update = useApiMutation('checklists', 'updateItem')
  const remove = useApiMutation('checklists', 'removeItem')
  const [editing, setEditing] = useState<false | 'text' | 'hint'>(false)
  const [text, setText] = useState(item.text)
  const [hint, setHint] = useState(item.hint)
  const cbId = useId()

  /** Starts from the current server text: it may have changed since the last edit. `field` gets the caret. */
  const startEditing = (field: 'text' | 'hint' = 'text'): void => {
    setText(item.text)
    setHint(item.hint)
    setEditing(field)
  }

  const save = (): void => {
    setEditing(false)
    if (text.trim() && (text.trim() !== item.text || hint !== item.hint)) {
      update.mutate({ id: item.id, patch: { text: text.trim(), hint } })
    }
  }

  const label = (
    <>
      <span className={cn('text-lead leading-snug', item.done && isRun && 'text-muted-foreground')}>
        {item.text}
      </span>
      {item.hint && (
        <span className="mt-0.5 block max-w-full text-caption text-muted-foreground truncate">
          {item.hint}
        </span>
      )}
    </>
  )

  return (
    // Right click: «Виконано» in a run, «Змінити» / «Видалити пункт» while editing (a field being typed in keeps the
    // text menu).
    <RecordMenu
      asChild
      def={checklistItemMenu}
      record={item}
      ctx={{ isRun, editing: !readOnly, onEdit: () => startEditing() }}
    >
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          'group relative flex items-start gap-3 rounded-2xl px-2 py-2',
          // A template step while reading has nothing to press: no hover tint there.
          (!readOnly || isRun) && 'hover:bg-surface',
          isDragging && 'z-10 bg-card shadow-lg ring-1 ring-border'
        )}
      >
        {/* Out of the flow, in the page's left padding: the text doesn't jump right when editing starts. */}
        <Button
          variant="ghost"
          size="icon-xs"
          data-edit-only
          {...attributes}
          {...listeners}
          className={cn('absolute top-2.5 -left-7 cursor-grab active:cursor-grabbing', ROW_ACTION)}
          aria-label="Перетягнути"
        >
          <GripVertical />
        </Button>
        {isRun ? (
          <Checkbox
            id={cbId}
            checked={item.done}
            onCheckedChange={(v) => update.mutate({ id: item.id, patch: { done: v === true } })}
            aria-label={item.text}
            variant="round"
            className="mt-0.5"
          />
        ) : (
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
        )}
        <div className="min-w-0 flex-1">
          {readOnly ? (
            isRun ? (
              // A tick works while reading: the text is the checkbox's label and toggles it too.
              <Label
                htmlFor={cbId}
                className="flex cursor-pointer flex-col items-start gap-0 leading-normal font-normal text-foreground overflow-hidden"
              >
                {label}
              </Label>
            ) : (
              <div className="flex flex-col">{label}</div>
            )
          ) : editing ? (
            <div
              className="flex flex-col gap-1.5"
              // Leaving the pair of fields (not moving between them) saves, like Enter does.
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) save()
              }}
            >
              <Input
                autoFocus={editing === 'text'}
                value={text}
                maxLength={ITEM_LIMITS.text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') setEditing(false)
                }}
              />
              <Input
                autoFocus={editing === 'hint'}
                value={hint}
                maxLength={ITEM_LIMITS.hint}
                placeholder="Підказка (необов’язково)"
                onChange={(e) => setHint(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                className="text-caption"
              />
            </div>
          ) : (
            // Editable in place, like InlineTitle: a tint and a pencil on hover / focus say the text can be changed.
            <div className="flex flex-col items-start gap-1.5">
              <Button
                variant="ghost"
                onClick={() => startEditing()}
                className="group/text relative -mx-1 h-auto w-[calc(100%+0.5rem)] flex-col items-start gap-0 rounded-lg px-1 py-0 pr-7 text-left font-normal whitespace-normal hover:bg-foreground/5"
              >
                {label}
                <Pencil
                  aria-hidden
                  className="absolute top-1.5 right-1.5 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/text:opacity-100 group-focus-visible/text:opacity-100"
                />
              </Button>
              {/* A hint can be added without opening the step itself: shown under the row's pointer or focus. */}
              {!item.hint && (
                <Button
                  variant="ghost"
                  size="xs"
                  // -ml-2 with px-2: «+ Підказка» starts exactly under the step's text, 6px below it.
                  className={cn('-ml-2 h-7 gap-1.5 px-2 text-caption', ROW_ACTION)}
                  onClick={() => startEditing('hint')}
                >
                  <Plus /> Підказка
                </Button>
              )}
            </div>
          )}
        </div>
        <IconAction
          label="Видалити пункт"
          data-edit-only
          onClick={() => remove.mutate(item.id)}
          // Always visible while editing: the step can be removed without hunting for it.
          className="mt-0.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </IconAction>
      </li>
    </RecordMenu>
  )
}
