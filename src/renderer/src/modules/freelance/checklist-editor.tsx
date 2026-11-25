import { useState, type ReactElement } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { preCheckSchema, type PreCheck } from '@shared/domain/freelance'
import { limitsOf } from '@/lib/limits'
import { useAutosave } from '@/hooks/use-autosave'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import { IconAction } from '@/components/common/icon-action'

const CHECK_MAX = limitsOf(preCheckSchema).label
/** platformInputSchema: `preChecklist: z.array(preCheckSchema).max(30)` (zod 4 arrays don't expose it). */
const ITEMS_MAX = 30

/** Platform pre-bid checklist: rename in place, reorder, remove, add (up to the schema limit). */
export function ChecklistEditor({
  items,
  onChange
}: {
  items: PreCheck[]
  onChange: (items: PreCheck[]) => void
}): ReactElement {
  const [text, setText] = useState('')
  const full = items.length >= ITEMS_MAX
  const move = (i: number, d: -1 | 1): void => {
    const next = [...items]
    const [it] = next.splice(i, 1)
    next.splice(i + d, 0, it)
    onChange(next)
  }
  const add = (): void => {
    const label = text.trim()
    if (!label || full) return
    onChange([...items, { id: `c${Date.now().toString(36)}`, label }])
    setText('')
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((c, i) => (
        <ChecklistRow
          key={c.id}
          item={c}
          first={i === 0}
          last={i === items.length - 1}
          onRename={(label) => onChange(items.map((x) => (x.id === c.id ? { ...x, label } : x)))}
          onUp={() => move(i, -1)}
          onDown={() => move(i, 1)}
          onRemove={() => onChange(items.filter((x) => x.id !== c.id))}
        />
      ))}
      <InputGroup>
        <InputGroupInput
          value={text}
          maxLength={CHECK_MAX}
          disabled={full}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Новий пункт, наприклад «Клієнт із потрібного часового поясу»"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="xs" disabled={!text.trim() || full} onClick={add}>
            <Plus /> Додати
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {full && (
        <p className="text-caption text-muted-foreground">Максимум {ITEMS_MAX} пунктів.</p>
      )}
    </div>
  )
}

function ChecklistRow({
  item,
  first,
  last,
  onRename,
  onUp,
  onDown,
  onRemove
}: {
  item: PreCheck
  first: boolean
  last: boolean
  onRename: (label: string) => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}): ReactElement {
  const [label, setLabel] = useAutosave(item.label, (l) => l.trim() && onRename(l.trim()))
  const empty = !label.trim()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          value={label}
          maxLength={CHECK_MAX}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Пункт чек-листа"
          aria-invalid={empty || undefined}
        />
        <IconAction label="Вище" disabled={first} onClick={onUp}>
          <ArrowUp />
        </IconAction>
        <IconAction label="Нижче" disabled={last} onClick={onDown}>
          <ArrowDown />
        </IconAction>
        <IconAction label="Видалити пункт" className="hover:text-destructive" onClick={onRemove}>
          <Trash2 />
        </IconAction>
      </div>
      {empty && <FieldError className="text-caption">Порожній пункт не збережеться</FieldError>}
    </div>
  )
}
