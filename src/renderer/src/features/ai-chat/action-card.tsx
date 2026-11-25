import { memo, type ReactElement } from 'react'
import { ArrowUpRight, Check, CircleAlert } from 'lucide-react'
import type { AiActionProposal } from '@shared/domain/ai-chat'
import { ENTITY_META } from '@shared/entity-types'
import { ENTITY_ICON } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { useOpenEntity } from '@/components/common/entity-link'
import { cn } from '@/lib/utils'
import { applyAction, dismissAction, useChatSession } from './session'

/**
 * One action the model proposed: what will be created or changed, with a preview, and the person's choice —
 * «Застосувати» / «Скасувати» (shadcn Item: a pending approval is a prompt, not an activity line). Nothing
 * happens without the click; after it the card says what was done and opens the record.
 */
export const ActionCard = memo(function ActionCard({
  action,
  chatId,
  messageId
}: {
  action: AiActionProposal
  chatId: string
  messageId: string
}): ReactElement {
  const ref = { chatId, messageId, actionId: action.id }
  const busy = useChatSession((s) => !!s.busy[action.id])
  const open = useOpenEntity()
  const { preview, status, problem, result } = action
  const Icon = ENTITY_ICON[preview.type]
  const where = preview.target ? `${ENTITY_META[preview.target.type].label} · ` : ''
  const labelId = `ai-action-${action.id}`
  return (
    <Item
      variant="outline"
      size="sm"
      role="group"
      aria-labelledby={labelId}
      data-ai-action={action.action.type}
      data-status={status}
      className="items-start rounded-xl bg-card"
    >
      <ItemMedia variant="icon" className="bg-foreground/7">
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemDescription className="text-caption" id={labelId}>
          {preview.label}
        </ItemDescription>
        <ItemTitle
          className={cn('w-full', status === 'dismissed' && 'text-muted-foreground line-through')}
          title={preview.title}
        >
          <span className="line-clamp-2">
            {where}
            {preview.title || 'Запис'}
          </span>
        </ItemTitle>
      </ItemContent>
      {preview.fields.length > 0 && (
        <ItemFooter className="w-full">
          <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
            {preview.fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="line-clamp-4 whitespace-pre-wrap wrap-anywhere">{f.value}</dd>
              </div>
            ))}
          </dl>
        </ItemFooter>
      )}
      {problem && status === 'proposed' && (
        <ItemFooter className="w-full">
          <p className="flex items-start gap-1.5 text-caption text-destructive" role="status">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {problem}
          </p>
        </ItemFooter>
      )}
      <ItemActions className="w-full justify-end">
        {status === 'proposed' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void dismissAction(ref)}
            >
              Скасувати
            </Button>
            <Button
              variant="soft"
              size="sm"
              disabled={busy || !!problem}
              data-ai-apply=""
              onClick={() => void applyAction(ref, open)}
            >
              {busy ? <Spinner /> : <Check />}
              Застосувати
            </Button>
          </>
        )}
        {status === 'applied' && result && (
          <>
            <span className="mr-auto flex items-center gap-1.5 text-caption text-success">
              <Check aria-hidden className="size-3.5" />
              Застосовано
            </span>
            <Button variant="ghost" size="sm" onClick={() => open(result.ref)}>
              Відкрити
              <ArrowUpRight />
            </Button>
          </>
        )}
        {status === 'dismissed' && (
          <span className="mr-auto text-caption text-muted-foreground">Скасовано</span>
        )}
      </ItemActions>
    </Item>
  )
})
