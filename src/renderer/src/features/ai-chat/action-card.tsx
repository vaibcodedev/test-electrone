import { memo, useRef, useState, type ReactElement } from 'react'
import { ArrowUpRight, Check, CircleAlert, Eye, Pencil, RotateCcw } from 'lucide-react'
import { AI_ACTIONS } from '@shared/domain/ai-actions'
import type { AiActionProposal } from '@shared/domain/ai-chat'
import { ENTITY_META } from '@shared/entity-types'
import { ENTITY_ICON } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
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
import { IconAction } from '@/components/common/icon-action'
import { fmtTitle } from '@/lib/format'
import { missingField, summaryOf, toEdits, withRaw } from './action-text'
import { Teaser } from './action-view'
import { ActionDialog, type PreviewMode } from './action-dialog'
import { applyAction, dismissAction, reopenAction, useChatSession } from './session'

/**
 * One action the model proposed — short: the type and the title, one summary line («12 пунктів у 4 розділах»)
 * and a few lines of the content. «Переглянути» (or a click on the card) opens the record as it will really look,
 * «Змінити» opens it for editing; nothing happens without «Застосувати». Applied or cancelled, the card folds
 * into one line («Створено: …» → «Відкрити», «Скасовано: …» → «Повернути»).
 */
export const ActionCard = memo(function ActionCard({
  action: proposal,
  chatId,
  messageId
}: {
  action: AiActionProposal
  chatId: string
  messageId: string
}): ReactElement {
  const ref = { chatId, messageId, actionId: proposal.id }
  const busy = useChatSession((s) => !!s.busy[proposal.id])
  const raw = useChatSession((s) => s.edits[proposal.id])
  const open = useOpenEntity()
  const [dialog, setDialog] = useState<PreviewMode | null>(null)
  const [mode, setMode] = useState<PreviewMode>('view')
  const viewButton = useRef<HTMLButtonElement>(null)
  // After «Застосувати» in the preview the buttons fold away: the focus goes to the compact line's action.
  const lineButton = useRef<HTMLButtonElement>(null)
  const { preview, status, problem, result } = proposal
  const action = withRaw(proposal.action, raw)
  const Icon = ENTITY_ICON[preview.type]
  const typeLabel = ENTITY_META[preview.type].label
  const edit = action.type === 'append_text' || action.type === 'add_tags'
  const title =
    (edit
      ? preview.title
      : String((action as Record<string, unknown>)[AI_ACTIONS[action.type].titleKey] ?? '')) ||
    'Без назви'
  const pending = status === 'proposed'
  const reason = problem ?? missingField(action)
  const show = (m: PreviewMode): void => {
    setMode(m)
    setDialog(m)
  }
  const labelId = `ai-action-${proposal.id}`
  const verdict = status === 'applied' ? (edit ? 'Змінено' : 'Створено') : 'Скасовано'
  const what = `${typeLabel} «${fmtTitle(status === 'applied' ? (result?.title ?? title) : title)}»`

  return (
    <Item
      variant="outline"
      size="sm"
      role="group"
      aria-labelledby={labelId}
      data-ai-action={action.type}
      data-status={status}
      className="items-start gap-x-3 gap-y-0 rounded-xl bg-card"
    >
      <ItemMedia variant="icon" className="bg-foreground/7">
        <Icon />
      </ItemMedia>
      {pending ? (
        // A click on the content is the mouse's way to «Переглянути»; the keyboard has the button.
        <ItemContent className="min-w-0 cursor-pointer" onClick={() => show('view')}>
          <ItemDescription className="line-clamp-1 text-caption" id={labelId}>
            {edit ? preview.label : `${typeLabel} · ${summaryOf(action, preview)}`}
          </ItemDescription>
          <ItemTitle className="w-full" title={title}>
            <span className="line-clamp-2">{title}</span>
          </ItemTitle>
        </ItemContent>
      ) : (
        <ItemContent className="min-w-0 justify-center self-center">
          <ItemTitle id={labelId} className="w-full font-normal" title={`${verdict}: ${what}`}>
            <span className="line-clamp-2">
              <span className="text-muted-foreground">{verdict}:</span> {what}
            </span>
          </ItemTitle>
        </ItemContent>
      )}
      {status === 'applied' && result && (
        <ItemActions className="self-center">
          <Button ref={lineButton} variant="ghost" size="sm" onClick={() => open(result.ref)}>
            Відкрити
            <ArrowUpRight />
          </Button>
        </ItemActions>
      )}
      {status === 'dismissed' && (
        <ItemActions className="self-center">
          <Button
            ref={lineButton}
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void reopenAction(ref)}
          >
            <RotateCcw />
            Повернути
          </Button>
        </ItemActions>
      )}
      {/* Applying or cancelling folds the teaser and the buttons away (Collapsible's own height motion). */}
      <Collapsible open={pending} className="min-w-0 basis-full">
        <CollapsibleContent>
          {/* The gap to the title lives inside (mt-2): a row gap would stay under the folded line. */}
          <div className="mt-2 flex min-w-0 flex-col gap-2.5 pl-11">
            <Teaser action={action} />
            {problem && (
              <p className="flex items-start gap-1.5 text-caption text-destructive" role="status">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {problem}
              </p>
            )}
            <ItemFooter className="justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto -ml-3 text-muted-foreground"
                disabled={busy}
                onClick={() => void dismissAction(ref)}
              >
                Скасувати
              </Button>
              {/* Icons with tooltips: four labelled buttons don't fit a 300 px panel in one row. */}
              <IconAction
                ref={viewButton}
                label="Переглянути"
                size="icon-sm"
                onClick={() => show('view')}
              >
                <Eye />
              </IconAction>
              <IconAction label="Змінити" size="icon-sm" onClick={() => show('edit')}>
                <Pencil />
              </IconAction>
              <Button
                variant="soft"
                size="sm"
                disabled={busy || !!reason}
                title={reason ?? undefined}
                data-ai-apply=""
                onClick={() => void applyAction(ref, open, toEdits(proposal.action.type, raw))}
              >
                {busy ? <Spinner /> : <Check />}
                Застосувати
              </Button>
            </ItemFooter>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <ActionDialog
        proposal={proposal}
        chatId={chatId}
        messageId={messageId}
        open={dialog !== null && pending}
        mode={mode}
        onModeChange={setMode}
        onOpenChange={(o) => !o && setDialog(null)}
        returnFocus={pending ? viewButton : lineButton}
      />
    </Item>
  )
})
