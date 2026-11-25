import { useState, type ReactElement } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import type { Mention } from '@shared/domain/mentions'
import { ENTITY_META } from '@shared/entity-types'
import { refKey } from '@shared/wikilinks'
import { ENTITY_ICON } from '@/app/navigation'
import { clickableProps } from '@/lib/clickable'
import { plural } from '@/lib/format'
import { useApi } from '@/lib/query'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { useOpenEntity } from './entity-link'
import { SectionLabel } from './section-label'
import { useDetailMode } from './detail-mode-context'

/** Rows shown before «Показати ще»: the aside also holds tags, links and files. */
const FIRST = 5

/**
 * «Згадки»: records whose text links here with «[[», each with the words around the link. Computed from the texts,
 * so there is nothing to add or remove by hand (that is «Зв’язки»). No mentions — no section, in both modes.
 */
export function MentionsPanel({ entity }: { entity: EntityRef }): ReactElement | null {
  const { data: mentions = [], isError, refetch } = useApi('mentions', 'list', entity)
  const [all, setAll] = useState(false)
  // A failed load is said in place, not passed off as «no mentions».
  if (isError)
    return (
      <section className="flex flex-col gap-2">
        <SectionLabel>Згадки</SectionLabel>
        <p className="text-caption text-muted-foreground">
          Не вдалося завантажити згадки.{' '}
          <Button variant="link" size="xs" onClick={() => void refetch()}>
            Повторити
          </Button>
        </p>
      </section>
    )
  if (!mentions.length) return null
  const shown = all ? mentions : mentions.slice(0, FIRST)
  const rest = mentions.length - shown.length
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Згадки</SectionLabel>
      <div className="-mx-2.5 flex flex-col">
        {shown.map((m) => (
          <MentionRow key={refKey(m)} mention={m} />
        ))}
      </div>
      {rest > 0 && (
        <Button variant="link" size="xs" className="self-start" onClick={() => setAll(true)}>
          Показати ще {rest}
        </Button>
      )}
    </section>
  )
}

/** Like EntityRow, but under the title — «Тип · фрагмент» around the link (up to three lines), the link in the text colour. */
function MentionRow({ mention }: { mention: Mention }): ReactElement {
  const mode = useDetailMode()
  const openEntity = useOpenEntity()
  const Icon = ENTITY_ICON[mention.type]
  const open = (): void =>
    mode.editing && mode.confirmClose
      ? mode.confirmClose(() => openEntity(mention))
      : openEntity(mention)
  const meta = [
    ENTITY_META[mention.type].label,
    mention.count > 1 && `${mention.count} ${plural(mention.count, ['згадка', 'згадки', 'згадок'])}`
  ]
    .filter(Boolean)
    .join(' · ')
  const { before, after } = mention.fragment
  return (
    <Item size="xs" className="group cursor-pointer items-start hover:bg-(--tile-hover)" asChild>
      <div {...clickableProps(open)}>
        <ItemMedia variant="icon" className="bg-foreground/7">
          <Icon />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="w-full truncate text-body" title={mention.title}>
            {mention.title}
          </ItemTitle>
          <ItemDescription className="line-clamp-3 text-meta wrap-anywhere">
            {meta} · {before}
            <span className="font-medium text-foreground">{mention.label}</span>
            {after}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </ItemActions>
      </div>
    </Item>
  )
}
