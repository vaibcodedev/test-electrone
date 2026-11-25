import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { EntitySummary } from '@shared/domain/common'
import { ENTITY_ICON } from '@/app/navigation'
import { cn } from '@/lib/utils'
import { clickableProps } from '@/lib/clickable'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'

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
  return (
    <Item size="xs" className={cn('group cursor-pointer hover:bg-(--tile-hover)', className)} asChild>
      <div {...clickableProps(() => (onOpen ? onOpen() : open(item)))}>
        <ItemMedia variant="icon" className="group-hover:bg-card">
          <Icon />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="w-full truncate text-body" title={item.title}>
            {item.title}
          </ItemTitle>
          {/* line-clamp-1, not truncate: ItemDescription's own line-clamp-2 wins over truncate and wrapped the meta. */}
          <ItemDescription className="line-clamp-1 text-meta">
            {ENTITY_META[item.type].label}
            {item.subtitle ? ` — ${item.subtitle}` : ''}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {trailing ?? <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />}
        </ItemActions>
      </div>
    </Item>
  )
}
