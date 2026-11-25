import type { ReactElement } from 'react'
import { ENTITY_META } from '@shared/entity-types'
import { refKey } from '@shared/wikilinks'
import { ENTITY_ICON } from '@/app/navigation'
import { fmtRelative } from '@/lib/format'
import { CommandItem } from '@/components/ui/command'
import type { EntityOptionItem } from '@/hooks/use-entity-search'

/** Search hits carry \u0001…\u0002 match markers — plain text is enough for a one-line preview. */
const plainSnippet = (s?: string): string =>
  (s ?? '').replaceAll('\u0001', '').replaceAll('\u0002', '').replace(/\s+/g, ' ').trim()

/**
 * One record in a picker list (`Command`): type icon, title, «Тип · деталь». Shared by «Зв’язати» and the «[[»
 * menu, so both pickers read the same. Its cmdk value (and `data-entity`, cmdk doesn't render the value) is `type:id`.
 */
export function EntityOption({
  item,
  onSelect
}: {
  item: EntityOptionItem
  onSelect: () => void
}): ReactElement {
  const Icon = ENTITY_ICON[item.type]
  // Type plus one fact: a preview line, else the time — identical titles («Нова нотатка» ×10) differ by it.
  const detail =
    plainSnippet(item.snippet) ||
    item.subtitle ||
    (item.updatedAt ? fmtRelative(item.updatedAt) : '')
  const meta = [ENTITY_META[item.type].label, detail].filter(Boolean).join(' · ')
  return (
    <CommandItem
      value={refKey(item)}
      data-entity={refKey(item)}
      onSelect={onSelect}
      className="items-start"
    >
      <Icon className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate">{item.title}</span>
        <span className="truncate text-meta text-muted-foreground">{meta}</span>
      </div>
    </CommandItem>
  )
}
