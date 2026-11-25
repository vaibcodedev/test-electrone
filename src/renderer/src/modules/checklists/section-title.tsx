import type { ReactElement } from 'react'
import { toast } from 'sonner'
import type { ChecklistItem } from '@shared/domain/checklists'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { useReadOnly } from '@/components/common/detail-mode'
import { InlineText } from '@/components/common/inline-text'
import { ITEM_LIMITS, NO_SECTION } from './use-checklist-order'

/**
 * Section heading, renamable in place while editing (plain text while reading), in the record title's style: no
 * border, a tint and a pencil under the pointer. Renaming «Без розділу» moves those items into a real section;
 * a section with no items yet (just added) is renamed in the page's own list — `onRename` instead of `items`.
 */
export function SectionTitle({
  section,
  items,
  onRename
}: {
  section: string
  items?: ChecklistItem[]
  onRename?: (next: string) => void
}): ReactElement {
  const readOnly = useReadOnly()
  const commit = async (next: string): Promise<void> => {
    if (onRename) return onRename(next)
    try {
      await Promise.all(
        (items ?? []).map((it) =>
          api.checklists.updateItem({ id: it.id, patch: { section: next } })
        )
      )
      invalidateAll()
      toast.success(next ? `Розділ «${next}»` : 'Пункти без розділу')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  if (readOnly) return <h2 className="font-display px-1 text-heading">{section || NO_SECTION}</h2>
  return (
    <InlineText
      value={section}
      onCommit={(next) => void commit(next)}
      placeholder={NO_SECTION}
      label={`Назва розділу ${section || NO_SECTION}`}
      maxLength={ITEM_LIMITS.section}
      className="font-display text-heading"
    />
  )
}
