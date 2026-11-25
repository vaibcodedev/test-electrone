import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import type { ChecklistItem } from '@shared/domain/checklists'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { useReadOnly } from '@/components/common/detail-mode'
import { Input } from '@/components/ui/input'
import { ITEM_LIMITS, NO_SECTION } from './use-checklist-order'

/**
 * Section heading, renamable in place while editing (plain text while reading). Renaming «Без розділу» moves
 * those items into a real section.
 * Saves on blur / Enter; Esc restores. The parent keys sections by name, so a renamed one starts fresh.
 */
export function SectionTitle({
  section,
  items
}: {
  section: string
  items: ChecklistItem[]
}): ReactElement {
  const readOnly = useReadOnly()
  const [value, setValue] = useState(section)
  const commit = async (): Promise<void> => {
    const next = value.trim()
    if (next === section) return
    try {
      await Promise.all(
        items.map((it) => api.checklists.updateItem({ id: it.id, patch: { section: next } }))
      )
      invalidateAll()
      toast.success(next ? `Розділ «${next}»` : 'Пункти без розділу')
    } catch (e) {
      toast.error((e as Error).message)
      setValue(section)
    }
  }
  if (readOnly) return <h2 className="font-display px-1 text-heading">{section || NO_SECTION}</h2>
  return (
    <Input
      value={value}
      placeholder={NO_SECTION}
      aria-label={`Назва розділу ${section || NO_SECTION}`}
      maxLength={ITEM_LIMITS.section}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setValue(section)
      }}
      className="font-display h-auto max-w-sm px-2 py-0.5 text-heading"
    />
  )
}
