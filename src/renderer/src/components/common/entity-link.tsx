import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { EntitySummary } from '@shared/domain/common'
import { ENTITY_ICON } from '@/app/navigation'
import { cn } from '@/lib/utils'
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
    <Item size="xs" className={cn('group cursor-pointer hover:bg-surface', className)} asChild>
      <div role="button" tabIndex={0} onClick={() => (onOpen ? onOpen() : open(item))} onKeyDown={(e) => e.key === 'Enter' && (onOpen ? onOpen() : open(item))}>
        <ItemMedia variant="icon" className="group-hover:bg-card">
          <Icon />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="w-full truncate text-body">{item.title}</ItemTitle>
          <ItemDescription className="truncate text-meta">
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
