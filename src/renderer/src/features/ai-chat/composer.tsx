import type { ReactElement, Ref } from 'react'
import { ArrowUp, Search, Square, X } from 'lucide-react'
import { PROMPT_MAX } from '@shared/domain/ai-chat'
import type { EntityRef } from '@shared/domain/common'
import { ENTITY_META } from '@shared/entity-types'
import { refKey } from '@shared/wikilinks'
import { ENTITY_ICON } from '@/app/navigation'
import { Badge } from '@/components/ui/badge'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '@/components/ui/input-group'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IconAction } from '@/components/common/icon-action'
import { useApi } from '@/lib/query'
import { stopMessage, useChatSession } from './session'

/** «Контекст: Нотатка «Docker»» — the open record goes with the question; ✕ leaves it out for this record. */
function ContextChip({ record }: { record: EntityRef }): ReactElement {
  const { data } = useApi('mentions', 'resolve', [record])
  const title = data?.[0]?.state === 'live' ? data[0].title : ''
  const Icon = ENTITY_ICON[record.type]
  const label = `Контекст: ${ENTITY_META[record.type].label}${title ? ` «${title}»` : ''}`
  return (
    <Badge variant="soft" className="h-7 max-w-full min-w-0 gap-1.5 pr-0.5 pl-2.5" title={label}>
      <Icon aria-hidden />
      <span className="truncate">{label}</span>
      <IconAction
        label="Не додавати запис до запиту"
        onClick={() => useChatSession.setState({ hiddenContext: refKey(record) })}
      >
        <X />
      </IconAction>
    </Badge>
  )
}

/**
 * The prompt (shadcn InputGroup: textarea, the context chip, «Шукати в моїй базі», send / stop). Enter sends,
 * Shift+Enter is a new line; a request in flight turns the send button into «Зупинити». Its own subscriptions:
 * typing re-renders only the composer, not the thread.
 */
export function Composer({
  ref,
  context,
  onSubmit,
  disabledReason
}: {
  ref?: Ref<HTMLTextAreaElement>
  context: EntityRef | null
  onSubmit: () => void
  disabledReason: string | null
}): ReactElement {
  const draft = useChatSession((s) => s.draft)
  const search = useChatSession((s) => s.search)
  const pending = useChatSession((s) => !!s.pending)
  const canSend = !!draft.trim() && !pending && !disabledReason
  return (
    <form
      className="shrink-0 px-3 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSubmit()
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          ref={ref}
          value={draft}
          onChange={(e) => useChatSession.setState({ draft: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            if (canSend) onSubmit()
          }}
          maxLength={PROMPT_MAX}
          rows={2}
          placeholder="Спитайте або попросіть щось додати…"
          aria-label="Повідомлення для ШІ"
          aria-describedby={disabledReason ? 'ai-chat-disabled' : undefined}
          data-ai-chat-input=""
          className="max-h-48 min-h-14"
        />
        <InputGroupAddon align="block-end" className="flex-wrap gap-1.5">
          {context && <ContextChip record={context} />}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                variant="chip-neutral"
                size="xs"
                pressed={search}
                onPressedChange={(on) => useChatSession.setState({ search: on })}
              >
                <Search />
                Шукати в моїй базі
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              ШІ відповість за вашими записами й дасть на них посилання
            </TooltipContent>
          </Tooltip>
          {pending ? (
            <InputGroupButton variant="soft" size="sm" className="ml-auto" onClick={stopMessage}>
              <Square />
              Зупинити
            </InputGroupButton>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="Надіслати"
                  aria-keyshortcuts="Enter"
                  disabled={!canSend}
                >
                  <ArrowUp />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>Надіслати · Enter</TooltipContent>
            </Tooltip>
          )}
        </InputGroupAddon>
      </InputGroup>
      {disabledReason && (
        <p id="ai-chat-disabled" className="mt-1.5 px-1 text-caption text-muted-foreground">
          {disabledReason}
        </p>
      )}
    </form>
  )
}
