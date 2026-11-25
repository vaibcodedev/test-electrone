import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode
} from 'react'
import { Sparkles } from 'lucide-react'
import { AI_CHAT_SHORTCUT } from '@/app/shortcuts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLocation } from 'react-router'
import { AI_CHAT_MAX, AI_CHAT_MIN, useUi } from '@/stores/ui-store'

// The panel's chunk (messages, Markdown, actions) loads on the first Ctrl+J, not on every start.
const AiChatPanel = lazy(() => import('./chat-panel'))

/** The library sets 100% inline; auto lets the flex row of the shell size the group (as in MasterDetail). */
const FILL = { width: 'auto', height: 'auto' } as const

/** «ШІ» in the title bar, at its right end — over the column the panel opens in. */
export function AiChatToggle(): ReactElement {
  const open = useUi((s) => s.aiChatOpen)
  const toggle = useUi((s) => s.toggleAiChat)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-ai-chat-toggle=""
          aria-label="Чат ШІ"
          aria-expanded={open}
          aria-controls="ai-chat"
          aria-keyshortcuts="Control+J"
          onClick={toggle}
          className={cn(
            'no-drag text-muted-foreground hover:bg-card hover:text-foreground',
            open && 'bg-card text-foreground'
          )}
        >
          <Sparkles />
          ШІ
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        Чат ШІ
        <KbdGroup>
          {AI_CHAT_SHORTCUT.keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  )
}

function PanelSkeleton(): ReactElement {
  return (
    <div className="panel flex h-full flex-col gap-3 p-4" aria-busy="true" aria-label="Чат ШІ">
      <Skeleton className="h-6 w-40 rounded-full" />
      <Skeleton className="mt-auto h-24 rounded-2xl" />
    </div>
  )
}

/**
 * The page and the chat side by side (shadcn Resizable): the chat is a paper panel of its own in the sage frame,
 * like the sidebar on the left — it narrows the page instead of covering it, so the page's own record pane stays
 * readable next to it. The page panel stays mounted when the chat opens or closes (no lost scroll or drafts).
 * Width — dragged, remembered; focus — into the chat on open, back where it was on close.
 */
export function ChatLayout({ children }: { children: ReactNode }): ReactElement {
  const open = useUi((s) => s.aiChatOpen)
  const width = useUi((s) => s.aiChatWidth)
  const setWidth = useUi((s) => s.setAiChatWidth)
  const setOpen = useUi((s) => s.setAiChatOpen)
  const full = useUi((s) => s.aiChatFull) && open
  const size = useRef(width)
  const before = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(open)

  // Remember where focus was before the panel took it; give it back when the panel closes from inside.
  useEffect(() => {
    if (open === wasOpen.current) return
    wasOpen.current = open
    if (open) {
      const el = document.activeElement
      before.current = el instanceof HTMLElement && el !== document.body ? el : null
      return
    }
    const target = before.current?.isConnected
      ? before.current
      : document.querySelector<HTMLElement>('[data-ai-chat-toggle]')
    before.current = null
    // Only when the focus went down with the panel: a click elsewhere already moved it on purpose.
    if (document.activeElement === document.body || !document.activeElement) target?.focus()
  }, [open])

  const close = useCallback(() => setOpen(false), [setOpen])

  // Any move from the full-page chat («Відкрити», a source, a link in an answer) opened the record under it,
  // where nothing seemed to happen: the chat goes back to a panel and the record shows up next to it.
  // By the address, not location.key: a hash changed directly (a link, the address bar) keeps the key.
  const { pathname, search } = useLocation()
  const address = pathname + search
  const setFull = useUi((s) => s.setAiChatFull)
  const seen = useRef(address)
  useEffect(() => {
    if (seen.current === address) return
    seen.current = address
    setFull(false)
  }, [address, setFull])

  const panel = (
    <Suspense fallback={<PanelSkeleton />}>
      <AiChatPanel onClose={close} />
    </Suspense>
  )

  // «На всю сторінку»: the chat lies over the page's area and the page stays mounted under it (drafts, scroll),
  // inert. The panel group never changes in this mode — its chat panel stays in place, empty: taking it out and
  // putting it back left the page at 100% plus the chat, wider than the window, and the sidebar slid off the left
  // edge. The chat's draft and thread live outside React (session.ts), so moving its content loses nothing.
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <ResizablePanelGroup
        orientation="horizontal"
        style={FILL}
        className="min-h-0 min-w-0 flex-1"
        inert={full}
        onLayoutChanged={() => {
          if (open && !full) setWidth(size.current)
        }}
      >
        <ResizablePanel id="page" minSize="360px" className="flex min-h-0 min-w-0 flex-col">
          {children}
        </ResizablePanel>
        {open && (
          <>
            {/* The 10px gap of the frame is the handle: a thin line shows on hover and focus. */}
            <ResizableHandle
              aria-label="Ширина чату ШІ"
              className="w-2.5 bg-transparent after:inset-y-6 after:rounded-full hover:after:bg-foreground/15 focus-visible:after:bg-ring"
            />
            <ResizablePanel
              id="ai-chat"
              defaultSize={`${width}px`}
              minSize={`${AI_CHAT_MIN}px`}
              maxSize={`${AI_CHAT_MAX}px`}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(s) => {
                size.current = s.inPixels
              }}
              className="flex min-h-0 min-w-0 flex-col"
            >
              {full ? <div className="panel h-full" /> : panel}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      {full && (
        // The paper covers the page's area; the chat itself is a centered column — answers and questions
        // spread to both edges of a wide window and its lines ran ~1 500px long.
        <div className="panel absolute inset-0 flex min-h-0 min-w-0 justify-center">
          <div className="flex h-full min-h-0 w-full max-w-4xl min-w-0 flex-col">{panel}</div>
        </div>
      )}
    </div>
  )
}
