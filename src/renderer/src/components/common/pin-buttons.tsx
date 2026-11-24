import { Pin, Star } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const pinCls =
  'size-8 min-w-8 rounded-full bg-surface p-0 text-muted-foreground hover:text-foreground data-[state=on]:bg-lime data-[state=on]:text-lime-foreground'

/** "Pin to dashboard" + "favorite" toggles for any entity (shadcn Toggle). */
export function PinButtons({ entity, className }: { entity: EntityRef; className?: string }) {
  const { data } = useApi('pins', 'state', entity)
  const toggle = useApiMutation('pins', 'toggle')
  return (
    <div className={cn('flex gap-1', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            className={pinCls}
            pressed={!!data?.pin}
            onPressedChange={() => toggle.mutate({ ref: entity, kind: 'pin' })}
            aria-label="Закрепить на главной"
          >
            <Pin />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>{data?.pin ? 'Открепить с главной' : 'Закрепить на главной'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            className={pinCls}
            pressed={!!data?.favorite}
            onPressedChange={() => toggle.mutate({ ref: entity, kind: 'favorite' })}
            aria-label="В избранное"
          >
            <Star />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>{data?.favorite ? 'Убрать из избранного' : 'В избранное'}</TooltipContent>
      </Tooltip>
    </div>
  )
}
