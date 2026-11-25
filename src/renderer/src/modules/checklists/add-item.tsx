import { useState, type ReactElement, type Ref } from 'react'
import { Plus } from 'lucide-react'
import { useApiMutation } from '@/lib/query'
import { Input } from '@/components/ui/input'
import { ITEM_LIMITS } from './use-checklist-order'

/** Quiet «Додати пункт» field under a section's list; Enter adds. Hidden while the checklist is only read. */
export function AddItem({
  checklistId,
  section,
  inputRef
}: {
  checklistId: string
  section: string
  /** Focused by «Додати пункти» in an empty checklist; not autoFocus — a new template keeps focus in its title. */
  inputRef?: Ref<HTMLInputElement>
}): ReactElement {
  const [text, setText] = useState('')
  const add = useApiMutation('checklists', 'addItem', { onSuccess: () => setText('') })
  return (
    <form
      data-edit-only
      className="flex w-full items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim() || add.isPending) return
        add.mutate({ checklistId, text: text.trim(), section })
      }}
    >
      {/* Centred on the item dots: row px-2 + half the 6px dot = 11px, minus half the 16px icon. */}
      <Plus className="ml-[3px] size-4 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={text}
        maxLength={ITEM_LIMITS.text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Додати пункт"
        aria-label={section ? `Додати пункт у розділ ${section}` : 'Додати пункт'}
        // Dashed: quiet, yet it reads as a field and keeps the focus ring (DS §8, §12).
        className="min-w-0 flex-1 border-dashed text-body"
      />
    </form>
  )
}
