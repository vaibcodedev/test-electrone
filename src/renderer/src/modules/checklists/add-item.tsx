import { useState, type ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { useApiMutation } from '@/lib/query'
import { Input } from '@/components/ui/input'
import { ITEM_LIMITS } from './use-checklist-order'

/** Quiet «Додати пункт» field under a section's list; Enter adds. Hidden while the checklist is only read. */
export function AddItem({ checklistId, section }: { checklistId: string; section: string }): ReactElement {
  const [text, setText] = useState('')
  const add = useApiMutation('checklists', 'addItem', { onSuccess: () => setText('') })
  return (
    <form
      data-edit-only
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim() || add.isPending) return
        add.mutate({ checklistId, text: text.trim(), section })
      }}
    >
      <Plus className="ml-[34px] size-4 shrink-0 text-muted-foreground" />
      <Input
        value={text}
        maxLength={ITEM_LIMITS.text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Додати пункт"
        aria-label={section ? `Додати пункт у розділ ${section}` : 'Додати пункт'}
        className="min-w-0 flex-1 border-0 bg-transparent px-1 text-body shadow-none focus-visible:bg-transparent focus-visible:ring-0"
      />
    </form>
  )
}
