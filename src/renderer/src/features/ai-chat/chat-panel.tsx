import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Gauge, Settings, Sparkles, TriangleAlert, WifiOff } from 'lucide-react'
import { aiPreset } from '@shared/domain/ai'
import { refKey } from '@shared/wikilinks'
import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Confirm } from '@/components/common/confirm'
import { EmptyState } from '@/components/common/page'
import { useApi } from '@/lib/query'
import { overlayOpen } from '@/lib/dom'
import { fmtNumber } from '@/lib/format'
import { useUi } from '@/stores/ui-store'
import { recordFromLocation } from './context'
import { ChatHeader } from './chat-header'
import { ChatThread } from './chat-thread'
import { Composer } from './composer'
import { newChat, sendMessage, stopMessage, useChatSession, type Outgoing } from './session'

const subscribeOnline = (cb: () => void): (() => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
const useOnline = (): boolean => useSyncExternalStore(subscribeOnline, () => navigator.onLine)

/**
 * «Чат ШІ»: the panel on the right (ChatLayout). Off or not set up — the way to «Налаштування → Штучний
 * інтелект»; set up — the thread and the composer. Esc stops an answer, then closes the panel.
 */
export default function AiChatPanel({ onClose }: { onClose: () => void }): ReactElement {
  const navigate = useNavigate()
  const { data: status, isError, refetch } = useApi('ai', 'status')
  const chatId = useChatSession((s) => s.chatId)
  const { data: chat } = useApi('aiChat', 'get', chatId ?? '', { enabled: !!chatId })
  const { pathname, search } = useLocation()
  const opened = useMemo(() => recordFromLocation(pathname, search), [pathname, search])
  const hidden = useChatSession((s) => s.hiddenContext)
  const context = opened && refKey(opened) !== hidden ? opened : null
  const asking = useChatSession((s) => s.consent)
  const online = useOnline()
  const input = useRef<HTMLTextAreaElement>(null)
  const ready = !!status?.ready

  const submit = (text?: string, withSearch?: boolean): void => {
    const s = useChatSession.getState()
    const out: Outgoing = {
      text: (text ?? s.draft).trim(),
      context,
      search: withSearch ?? s.search,
      page: `${pathname}${search}`
    }
    if (!out.text || s.pending || !status?.ready) return
    if ((out.context || out.search) && !status.consented) {
      useChatSession.setState({ consent: out })
      return
    }
    void sendMessage(out)
  }

  // The composer gets the focus as soon as it is there (Ctrl+J, «ШІ»).
  useEffect(() => {
    if (ready) input.current?.focus()
  }, [ready])

  // Ctrl+K «Спитати ШІ: …»: a new chat with that question, searching the base.
  const ask = useUi((s) => s.aiAsk)
  useEffect(() => {
    if (!ask || !status) return
    const taken = useUi.getState().takeAiAsk()
    if (!taken) return
    if (!status.ready) {
      useChatSession.setState({ draft: taken.text })
      return
    }
    newChat()
    useChatSession.setState({ search: true })
    submit(taken.text, true)
    // submit reads the latest state itself; the effect runs once per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, status])

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    // A menu or a dialog of the panel (a portal) closes itself first.
    if (!e.currentTarget.contains(e.target as Node) || overlayOpen()) return
    e.preventDefault()
    if (useChatSession.getState().pending) stopMessage()
    else onClose()
  }

  const preset = aiPreset(status?.settings.preset ?? 'gemini')
  const limitReached = !!status && status.usage.requests >= status.usage.limit
  const title = chat?.title ?? 'Новий чат'

  let body: ReactElement
  if (!status) {
    body = isError ? (
      <EmptyState
        icon={TriangleAlert}
        title="Не вдалося завантажити налаштування ШІ"
        hint="Спробуйте ще раз. Якщо не вийде, подробиці є в журналі: Налаштування → Дані."
        cta={{ label: 'Повторити', onClick: () => void refetch() }}
      />
    ) : (
      <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="mt-auto h-24 rounded-2xl" />
      </div>
    )
  } else if (!status.ready) {
    const off = !status.settings.enabled
    body = (
      <EmptyState
        icon={Sparkles}
        title={off ? 'ШІ вимкнено' : 'Залишився один крок'}
        hint={
          off
            ? 'Увімкніть його й виберіть провайдера. Є безкоштовні варіанти й моделі на цьому комп’ютері, які нічого не надсилають в інтернет.'
            : `${status.missing ?? 'Доналаштуйте провайдера'}. Після цього чат запрацює.`
        }
        cta={{
          label: 'Відкрити налаштування',
          icon: Settings,
          onClick: () => navigate('/settings#ai')
        }}
        className="my-auto"
      />
    )
  } else {
    body = (
      <>
        <ChatThread
          chat={chat ?? null}
          hasContext={!!context}
          onStart={(text) => {
            useChatSession.setState({ draft: text })
            input.current?.focus()
          }}
          footer={
            <>
              {!online && !status.local && (
                <Marker role="status">
                  <MarkerIcon>
                    <WifiOff />
                  </MarkerIcon>
                  <MarkerContent>
                    Немає інтернету — {preset.short} не відповість, поки зв’язок не повернеться
                  </MarkerContent>
                </Marker>
              )}
              {limitReached && (
                <Marker role="status">
                  <MarkerIcon>
                    <Gauge />
                  </MarkerIcon>
                  <MarkerContent>
                    Денний ліміт вичерпано: {fmtNumber(status.usage.requests)} з{' '}
                    {fmtNumber(status.usage.limit)} запитів.{' '}
                    <Button variant="link" size="xs" onClick={() => navigate('/settings#ai')}>
                      Змінити ліміт
                    </Button>
                  </MarkerContent>
                </Marker>
              )}
            </>
          }
        />
        <Composer
          ref={input}
          context={context}
          onSubmit={() => submit()}
          disabledReason={limitReached ? 'Нові запити — завтра або після зміни ліміту' : null}
        />
      </>
    )
  }

  return (
    <section
      id="ai-chat"
      aria-label="Чат ШІ"
      className="panel flex h-full min-h-0 flex-col overflow-hidden"
      onKeyDown={onKeyDown}
    >
      <ChatHeader title={ready ? title : 'Чат ШІ'} status={status} onClose={onClose} />
      <Separator />
      {body}
      {status && (
        <Confirm
          open={!!asking}
          onOpenChange={(open) => !open && useChatSession.setState({ consent: null })}
          tone="default"
          title={`Надіслати текст записів у ${preset.short}?`}
          description={`Щоб відповісти, Vault надішле ${preset.short} текст відкритого запису та записів, знайдених у базі${preset.privacy ? `: ${preset.privacy}` : ''}. Спитаємо один раз для цього провайдера. Щоб нічого не йшло в інтернет, виберіть Ollama або LM Studio в Налаштування → Штучний інтелект.`}
          confirmLabel="Надіслати"
          onConfirm={() => {
            const out = useChatSession.getState().consent
            useChatSession.setState({ consent: null })
            if (out) void sendMessage(out, true)
          }}
        />
      )}
    </section>
  )
}
