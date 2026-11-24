import { useNavigate } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { EntitySummary } from '@shared/domain/common'
import { ENTITY_ICON } from '@/app/navigation'
import { cn } from '@/lib/utils'

export function useOpenEntity(): (ref: Pick<EntitySummary, 'type' | 'id'>) => void {
  const navigate = useNavigate()
  return (ref) => navigate(ENTITY_META[ref.type].route(ref.id))
}

/** A compact row pointing to any entity (used by links, pins, search, recent). */
export function EntityRow({
  item,
  trailing,
  className,
  onOpen
}: {
  item: EntitySummary
  trailing?: React.ReactNode
  className?: string
  onOpen?: () => void
}) {
  const open = useOpenEntity()
  const Icon = ENTITY_ICON[item.type]
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (onOpen ? onOpen() : open(item))}
      onKeyDown={(e) => e.key === 'Enter' && (onOpen ? onOpen() : open(item))}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface',
        className
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface group-hover:bg-card">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{item.title}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {ENTITY_META[item.type].label}
          {item.subtitle ? ` — ${item.subtitle}` : ''}
        </span>
      </span>
      {trailing ?? <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />}
    </div>
  )
}
