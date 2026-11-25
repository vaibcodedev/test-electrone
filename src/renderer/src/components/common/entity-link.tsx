import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { EntitySummary } from '@shared/domain/common'
import { ENTITY_ICON } from '@/app/navigation'
import { cn } from '@/lib/utils'
import { clickableProps } from '@/lib/clickable'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'

export function useOpenEntity(): (ref: Pick<EntitySummary, 'type' | 'id'>) => void {
  const navigate = useNavigate()
  return (ref) => navigate(ENTITY_META[ref.type].route(ref.id))
}

/** A compact row pointing to any entity (shadcn Item) — used by links, pins, search, recent. */
export function EntityRow({
  item,
  trailing,
  className,
  onOpen
}: {
  item: EntitySummary
  trailing?: ReactNode
  className?: string
  onOpen?: () => void
}) {
  const open = useOpenEntity()
  const Icon = ENTITY_ICON[item.type]
  const meta = [ENTITY_META[item.type].label, item.subtitle].filter(Boolean).join(' · ')
  return (
    <Item
      size="xs"
      className={cn('group cursor-pointer hover:bg-(--tile-hover)', className)}
      asChild
    >
      <div {...clickableProps(() => (onOpen ? onOpen() : open(item)))}>
        {/* foreground/7 reads on card, surface and the hover tile alike: bg-surface vanished on a surface card and
            the circle only appeared on hover. */}
        <ItemMedia variant="icon" className="bg-foreground/7">
          <Icon />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="w-full truncate text-body" title={item.title}>
            {item.title}
          </ItemTitle>
          {/* line-clamp-1, not truncate: ItemDescription's own line-clamp-2 wins over truncate and wrapped the meta.
              «Тип · деталь», the same separator as the link picker above it. break-all: a long word with no
              spaces (a board name) broke whole onto the hidden 2nd line and left «Картка ·…»; now it is cut where
              the line ends, like truncate. The full text is in the tooltip. */}
          <ItemDescription className="line-clamp-1 break-all text-meta" title={meta}>
            {meta}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {trailing ?? (
            <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
          )}
        </ItemActions>
      </div>
    </Item>
  )
}
