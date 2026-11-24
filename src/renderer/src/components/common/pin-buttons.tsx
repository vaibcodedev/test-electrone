import { Pin, Star } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** "Pin to dashboard" + "favorite" toggles for any entity. */
export function PinButtons({ entity, className }: { entity: EntityRef; className?: string }) {
  const { data } = useApi('pins', 'state', entity)
  const toggle = useApiMutation('pins', 'toggle')
  const btn = (active: boolean): string =>
    cn(
      'grid size-8 place-items-center rounded-full transition-colors',
      active ? 'bg-lime text-lime-foreground' : 'bg-surface text-muted-foreground hover:text-foreground'
    )
  return (
    <div className={cn('flex gap-1', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={btn(!!data?.pin)}
            onClick={() => toggle.mutate({ ref: entity, kind: 'pin' })}
            aria-pressed={!!data?.pin}
          >
            <Pin className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{data?.pin ? 'Открепить с главной' : 'Закрепить на главной'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={btn(!!data?.favorite)}
            onClick={() => toggle.mutate({ ref: entity, kind: 'favorite' })}
            aria-pressed={!!data?.favorite}
          >
            <Star className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{data?.favorite ? 'Убрать из избранного' : 'В избранное'}</TooltipContent>
      </Tooltip>
    </div>
  )
}
