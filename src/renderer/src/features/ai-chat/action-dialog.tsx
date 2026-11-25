import { useId, type ReactElement, type RefObject } from 'react'
import { Check, Eye, Pencil } from 'lucide-react'
import type { AiActionProposal } from '@shared/domain/ai-chat'
import { ENTITY_META } from '@shared/entity-types'
import { ENTITY_ICON } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Segmented } from '@/components/common/page'
import { useOpenEntity } from '@/components/common/entity-link'
import { missingField, toEdits, withRaw } from './action-text'
import { ActionEditor, RecordPreview } from './action-view'
import { applyAction, setEdit, dropEdits, useChatSession } from './session'

export type PreviewMode = 'view' | 'edit'

/**
 * «Переглянути»: the record as it will look after «Застосувати», and «Змінити» right there — the same fields with
 * the module form's limits; the edits stay with the card until applied or dropped. A Dialog, not a Sheet: a
 * sheet from the right would cover the chat it came from. Esc or «Закрити» returns the focus to the card.
 */
export function ActionDialog({
  proposal,
  chatId,
  messageId,
  open,
  mode,
  onModeChange,
  onOpenChange,
  returnFocus
}: {
  proposal: AiActionProposal
  chatId: string
  messageId: string
  open: boolean
  mode: PreviewMode
  onModeChange: (mode: PreviewMode) => void
  onOpenChange: (open: boolean) => void
  returnFocus: RefObject<HTMLElement | null>
}): ReactElement {
  const raw = useChatSession((s) => s.edits[proposal.id])
  const busy = useChatSession((s) => !!s.busy[proposal.id])
  const openEntity = useOpenEntity()
  const reasonId = useId()
  const action = withRaw(proposal.action, raw)
  const missing = missingField(action)
  const type = proposal.preview.type
  const Icon = ENTITY_ICON[type]
  const label = ENTITY_META[type].label
  const edited = !!raw && Object.keys(raw).length > 0
  const reason = proposal.problem ?? missing
  const apply = async (): Promise<void> => {
    const ref = { chatId, messageId, actionId: proposal.id }
    if (await applyAction(ref, openEntity, toEdits(proposal.action.type, raw))) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid max-h-[min(88vh,52rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-2xl"
        onCloseAutoFocus={(e) => {
          if (returnFocus.current?.isConnected) {
            e.preventDefault()
            returnFocus.current.focus()
          }
        }}
      >
        <DialogHeader className="gap-3 border-b px-6 pt-5 pb-4">
          <div className="flex min-w-0 items-center gap-2 pr-8">
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="min-w-0 truncate text-lead font-semibold">
              {proposal.action.type === 'append_text' || proposal.action.type === 'add_tags'
                ? proposal.preview.label
                : `Новий запис: ${label.toLocaleLowerCase('uk')}`}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Так запис виглядатиме після «Застосувати». «Змінити» — поправити поля перед цим.
          </DialogDescription>
          <Segmented<PreviewMode>
            value={mode}
            onChange={onModeChange}
            size="xs"
            options={[
              {
                value: 'view',
                label: (
                  <>
                    <Eye /> Перегляд
                  </>
                )
              },
              {
                value: 'edit',
                label: (
                  <>
                    <Pencil /> Змінити
                  </>
                )
              }
            ]}
          />
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-6 py-5" data-ai-preview={mode}>
          {mode === 'view' ? (
            <RecordPreview action={action} preview={proposal.preview} />
          ) : (
            <ActionEditor
              action={proposal.action}
              raw={raw ?? {}}
              onChange={(key, value) => setEdit(proposal.id, key, value)}
            />
          )}
        </div>
        <DialogFooter className="items-center gap-2 border-t px-6 py-3 sm:justify-between">
          <p
            id={reasonId}
            aria-live="polite"
            className="min-w-0 text-caption text-muted-foreground"
          >
            {reason ??
              (edited ? 'Є зміни — вони збережуться з карткою, доки ви не застосуєте' : '')}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {edited && (
              <Button variant="ghost" size="sm" onClick={() => dropEdits(proposal.id)}>
                Скасувати зміни
              </Button>
            )}
            <Button variant="soft" size="sm" onClick={() => onOpenChange(false)}>
              Закрити
            </Button>
            <Button
              size="sm"
              disabled={busy || !!reason}
              aria-describedby={reason ? reasonId : undefined}
              data-ai-apply=""
              onClick={() => void apply()}
            >
              {busy ? <Spinner /> : <Check />}
              Застосувати
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
