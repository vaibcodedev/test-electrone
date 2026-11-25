import type { ReactElement } from 'react'
import { Pin, Star } from 'lucide-react'
import { toast } from 'sonner'
import type { EntityRef } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const baseCls =
  'size-8 min-w-8 rounded-full bg-surface p-0 text-muted-foreground hover:text-foreground'
// Pinned = ink pill (it's on the dashboard now); favourite = filled amber star, like project favourites.
// Focus ring on the ink pill: ink-accent, as on Toggle outline — --ring on the dark-theme ink was 1.1:1.
const pinCls = `${baseCls} on:bg-ink on:text-ink-foreground on:hover:text-ink-foreground on:focus-visible:ring-ink-accent`
const starCls = `${baseCls} on:bg-warn/15 on:text-warn on:hover:text-warn`

/** A tooltip saying what the toggle does and, on a second quieter line, where the result shows. */
function TwoLines({ title, hint }: { title: string; hint: string }): ReactElement {
  return (
    <span className="flex flex-col">
      <span>{title}</span>
      <span className="text-meta opacity-80">{hint}</span>
    </span>
  )
}

/** "Pin to dashboard" + "favorite" toggles for any entity (shadcn Toggle). */
export function PinButtons({
  entity,
  className
}: {
  entity: EntityRef
  className?: string
}): ReactElement {
  const { data } = useApi('pins', 'state', entity)
  // The result is the new state: say what happened, a toggle alone is easy to miss.
  // ★ moves the record to the top of its list: the toast says why the row jumped.
  const toggle = useApiMutation('pins', 'toggle', {
    onSuccess: (on, { kind }) => {
      if (kind === 'pin') toast.success(on ? 'Закріплено на головній' : 'Відкріплено з головної')
      else if (on)
        toast.success('Додано в обране', { description: 'Тепер запис першим у своєму розділі' })
      else toast.success('Прибрано з обраного')
    }
  })
  return (
    <div className={cn('flex gap-1', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            className={pinCls}
            pressed={!!data?.pin}
            onPressedChange={() => toggle.mutate({ ref: entity, kind: 'pin' })}
            aria-label="Закріпити на головній"
          >
            <Pin />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          {data?.pin ? (
            'Відкріпити з головної'
          ) : (
            <TwoLines title="Закріпити на головній" hint="Запис з’явиться в картці «Закріплено»" />
          )}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            className={starCls}
            pressed={!!data?.favorite}
            onPressedChange={() => toggle.mutate({ ref: entity, kind: 'favorite' })}
            aria-label="В обране"
          >
            <Star className={cn(data?.favorite && 'fill-current')} />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          {data?.favorite ? (
            'Прибрати з обраного'
          ) : (
            <TwoLines title="В обране" hint="Запис стоятиме першим у своєму розділі" />
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
