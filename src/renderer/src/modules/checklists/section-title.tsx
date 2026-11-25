import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import type { ChecklistItem } from '@shared/domain/checklists'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { Input } from '@/components/ui/input'
import { ITEM_LIMITS, NO_SECTION } from './use-checklist-order'

/**
 * Section heading, renamable in place. Renaming «Без розділу» moves those items into a real section.
 * Saves on blur / Enter; Esc restores. The parent keys sections by name, so a renamed one starts fresh.
 */
export function SectionTitle({
  checklistId,
  section,
  items
}: {
  checklistId: string
  section: string
  items: ChecklistItem[]
}): ReactElement {
  const [value, setValue] = useState(section)
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
      className="font-display h-auto max-w-sm border-transparent bg-transparent px-1 py-0.5 text-heading placeholder:text-foreground hover:border-input focus-visible:bg-foreground/[0.04]"
    />
  )
}
