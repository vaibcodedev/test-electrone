import { useState, type ReactElement } from 'react'
import { History, MessageSquarePlus, Sparkles, Trash2, X } from 'lucide-react'
import { aiPreset, type AiStatus } from '@shared/domain/ai'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { useApi } from '@/lib/query'
import { fmtNumber, fmtRelative, fmtTitle } from '@/lib/format'
import { newChat, openChat, removeChat, useChatSession } from './session'

/** «Claude · claude-haiku-5-5 · Використано 3 з 100». */
function usageLine(status: AiStatus): string {
  const preset = aiPreset(status.settings.preset)
  const model = status.model || 'модель, завантажена в LM Studio'
  const { requests, limit } = status.usage
  return `${preset.short} · ${model} · Використано ${fmtNumber(requests)} з ${fmtNumber(limit)}`
}

function HistoryMenu({ title }: { title: string }): ReactElement {
  const chatId = useChatSession((s) => s.chatId)
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  // The list loads only while the menu is open.
  const { data: chats = [], isLoading } = useApi('aiChat', 'list', undefined, { enabled: open })
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Історія чатів">
                <History />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Історія чатів</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="max-h-[min(60vh,420px)] w-72 overflow-y-auto">
          <DropdownMenuLabel>Історія чатів · на цьому комп’ютері</DropdownMenuLabel>
          <DropdownMenuGroup>
            {chats.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={() => openChat(c.id)}
                aria-current={c.id === chatId ? 'true' : undefined}
                className="aria-current:font-medium"
              >
                <span className="min-w-0 flex-1 truncate" title={c.title}>
                  {c.title}
                </span>
                <DropdownMenuShortcut className="tracking-normal">
                  {fmtRelative(c.updatedAt)}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            {!isLoading && chats.length === 0 && (
              <DropdownMenuItem disabled>Чатів поки немає</DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {chatId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onSelect={() => setAsking(true)}>
                  <Trash2 />
                  Видалити цей чат
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Confirm
        open={asking}
        onOpenChange={setAsking}
        title={`Видалити чат «${fmtTitle(title)}»?`}
        description="Повідомлення зникнуть з історії. Записи, створені з чату, залишаться. Відновити не можна."
        confirmLabel="Видалити"
        onConfirm={() => chatId && void removeChat(chatId)}
      />
    </>
  )
}

/** Title, history, «Новий чат», ✕ — and under them where the request goes and how much of today's limit is used. */
export function ChatHeader({
  title,
  status,
  onClose
}: {
  title: string
  status: AiStatus | undefined
  onClose: () => void
}): ReactElement {
  return (
    <header className="flex shrink-0 flex-col gap-0.5 px-4 pt-3 pb-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <h2
          id="ai-chat-title"
          className="min-w-0 flex-1 truncate text-body font-semibold"
          title={title}
        >
          {title}
        </h2>
        {status?.ready && (
          <>
            <HistoryMenu title={title} />
            <IconAction label="Новий чат" size="icon-sm" onClick={newChat}>
              <MessageSquarePlus />
            </IconAction>
          </>
        )}
        <IconAction label="Закрити" shortcut="Esc" size="icon-sm" onClick={onClose}>
          <X />
        </IconAction>
      </div>
      {status?.ready && (
        <p className="truncate pl-6 text-meta text-muted-foreground" title={usageLine(status)}>
          {usageLine(status)}
        </p>
      )}
    </header>
  )
}
