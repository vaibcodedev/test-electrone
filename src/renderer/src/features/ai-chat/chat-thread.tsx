import { memo, type ReactElement, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CircleSlash, Copy, Database, RotateCcw, Settings, Sparkles } from 'lucide-react'
import type { AiChat, AiChatMessage } from '@shared/domain/ai-chat'
import type { EntityRef } from '@shared/domain/common'
import { ENTITY_META } from '@shared/entity-types'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent, MessageFooter } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@/components/ui/message-scroller'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/common/page'
import { EntityRow } from '@/components/common/entity-link'
import { IconAction } from '@/components/common/icon-action'
import { Markdown } from '@/components/common/markdown'
import { copyText } from '@/components/common/copy-button'
import { fmtDateTime, plural } from '@/lib/format'
import { ActionCard } from './action-card'
import { retryLast, sendMessage, useChatSession, type Outgoing } from './session'

/**
 * The thread's rhythm (docs/design-system.md → Чат ШІ): a readable column, 16px between messages and 12px more
 * before each new question, so a question and its answer read as one turn.
 */
const COLUMN = 'mx-auto w-full max-w-3xl'
const TURN = 'pt-3 first:pt-0'

/** «14:05», the full date in a tooltip: when it was said, without a timestamp on every line. */
function Time({ at }: { at: number }): ReactElement {
  const d = new Date(at)
  const short = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={d.toISOString()} tabIndex={0} className="rounded-sm tabular-nums">
          {short}
        </time>
      </TooltipTrigger>
      <TooltipContent>{fmtDateTime(at)}</TooltipContent>
    </Tooltip>
  )
}

function Question({
  text,
  context,
  search,
  at
}: {
  text: string
  context: EntityRef | null
  search: boolean
  at?: number
}): ReactElement {
  const notes = [
    context ? `Контекст: ${ENTITY_META[context.type].label.toLocaleLowerCase('uk')}` : '',
    search ? 'з пошуком у базі' : ''
  ].filter(Boolean)
  return (
    <Message align="end">
      <MessageContent className="gap-1.5">
        <Bubble align="end">
          <BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
        </Bubble>
        {(notes.length > 0 || at) && (
          <MessageFooter className="max-w-[85%] pr-1">
            <span className="min-w-0 truncate">{notes.join(' · ')}</span>
            {at && <Time at={at} />}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  )
}

function Sources({ message }: { message: AiChatMessage }): ReactElement | null {
  if (!message.sources.length) return null
  const cited = message.sources.filter((s) => s.cited)
  const shown = cited.length ? cited : message.sources
  return (
    <section aria-label="Записи з бази" className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
        <Database aria-hidden className="size-3.5" />
        {cited.length ? 'Джерела з бази' : 'Знайдено в базі'}
      </h3>
      {shown.map((s) => (
        <EntityRow
          key={`${s.ref.type}:${s.ref.id}`}
          item={{ ...s.ref, title: s.title, updatedAt: 0, deletedAt: null }}
          className="-mx-2.5"
        />
      ))}
    </section>
  )
}

/**
 * An answer's own actions under it — «Скопіювати», «Повторити відповідь» on the last one, the time: quiet until
 * the answer is hovered or reached with the keyboard (WCAG 2.4.7: never invisible while focused).
 */
function AnswerActions({
  message,
  onRetry
}: {
  message: AiChatMessage
  onRetry?: () => void
}): ReactElement {
  return (
    <MessageFooter className="-ml-1.5 gap-0.5 px-0 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 focus-within:opacity-100">
      {message.text && (
        <IconAction label="Скопіювати відповідь" onClick={() => void copyText(message.text)}>
          <Copy />
        </IconAction>
      )}
      {onRetry && (
        <IconAction label="Повторити відповідь" onClick={onRetry}>
          <RotateCcw />
        </IconAction>
      )}
      <span className="ml-1.5">
        <Time at={message.at} />
      </span>
    </MessageFooter>
  )
}

/** One saved turn. Memoized: typing in the composer or a new answer doesn't re-render the older ones. */
const SavedMessage = memo(function SavedMessage({
  message,
  chatId,
  onRetry
}: {
  message: AiChatMessage
  chatId: string
  onRetry?: () => void
}): ReactElement {
  if (message.role === 'user')
    return (
      <Question
        text={message.text}
        context={message.context}
        search={message.searched}
        at={message.at}
      />
    )
  return (
    <Message align="start">
      <MessageContent className="gap-3">
        {message.text && (
          <Bubble variant="ghost">
            <BubbleContent>
              {/* Code in a narrow panel wraps instead of scrolling sideways; its copy button is the Markdown's own. */}
              <Markdown
                source={message.text}
                className="[&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere"
              />
            </BubbleContent>
          </Bubble>
        )}
        {message.actions.map((a) => (
          <ActionCard key={a.id} action={a} chatId={chatId} messageId={message.id} />
        ))}
        {message.skipped > 0 && (
          <Marker>
            <MarkerIcon>
              <CircleSlash />
            </MarkerIcon>
            <MarkerContent>
              ШІ запропонував ще {message.skipped} {plural(message.skipped, ['дію', 'дії', 'дій'])}{' '}
              у незрозумілому форматі — їх пропущено
            </MarkerContent>
          </Marker>
        )}
        <Sources message={message} />
        <AnswerActions message={message} onRetry={onRetry} />
      </MessageContent>
    </Message>
  )
})

function Thinking({ search }: { search: boolean }): ReactElement {
  return (
    <Message align="start">
      <MessageContent>
        <Marker role="status">
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent>{search ? 'Шукаю в базі й думаю…' : 'Думаю…'}</MarkerContent>
        </Marker>
      </MessageContent>
    </Message>
  )
}

function Failure({ failure }: { failure: Outgoing & { message: string } }): ReactElement {
  const navigate = useNavigate()
  // The limit, a key, a model: the fix is in the settings.
  const settings = /Налаштування|налаштуваннях|ключ|ліміт|модел/i.test(failure.message)
  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="destructive">
          <BubbleContent role="alert">{failure.message}</BubbleContent>
        </Bubble>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="soft"
            size="sm"
            onClick={() =>
              void sendMessage({
                text: failure.text,
                context: failure.context,
                search: failure.search,
                page: failure.page,
                retry: failure.retry
              })
            }
          >
            <RotateCcw />
            Повторити
          </Button>
          {settings && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings#ai')}>
              <Settings />
              Налаштування ШІ
            </Button>
          )}
        </div>
      </MessageContent>
    </Message>
  )
}

/** A start of a request: «…» fills the composer to finish the sentence, a whole question is asked at once. */
interface Start {
  label: string
  text: string
  send?: boolean
}

const RECORD_STARTS: Start[] = [
  { label: 'Підсумуй цей запис', text: 'Підсумуй цей запис', send: true },
  { label: 'Запропонуй мітки', text: 'Запропонуй мітки для цього запису', send: true },
  { label: 'Додай план дій', text: 'Додай до запису план дій', send: true }
]
const APP_STARTS: Start[] = [
  { label: 'Створи чек-лист…', text: 'Створи шаблон чек-листа: ' },
  { label: 'Додай слово…', text: 'Додай в англійську слово: ' },
  { label: 'Додай подію…', text: 'Додай подію на завтра о 10:00: ' },
  { label: 'Як сховати розділ?', text: 'Як сховати розділ меню, яким я не користуюся?', send: true }
]

/** A new chat: what the chat can do, and starts that are about this app. */
function Intro({
  hasContext,
  onStart
}: {
  hasContext: boolean
  onStart: (start: Start) => void
}): ReactElement {
  const starts = hasContext ? RECORD_STARTS : APP_STARTS
  return (
    <EmptyState
      icon={Sparkles}
      title="Чим допомогти?"
      hint="Спитайте про Vault чи свої записи або попросіть створити чек-лист, нотатку, картку, подію, слово… ШІ покаже, як це виглядатиме, — застосовуєте ви."
      className="my-auto py-8"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {starts.map((s) => (
            <Button key={s.label} variant="soft" size="sm" onClick={() => onStart(s)}>
              {s.label}
            </Button>
          ))}
        </div>
      }
    />
  )
}

/**
 * The conversation (shadcn MessageScroller: follows the answer, keeps the question in view, «до останнього»
 * when scrolled away) in a readable column. The content is a `log` region: a new answer is read out.
 */
export function ChatThread({
  chat,
  hasContext,
  onStart,
  footer
}: {
  chat: AiChat | null
  hasContext: boolean
  /** A start was picked: fill the composer with its text, or ask it right away (`send`). */
  onStart: (text: string, send: boolean) => void
  footer?: ReactNode
}): ReactElement {
  const pending = useChatSession((s) => s.pending)
  const failure = useChatSession((s) => s.failure)
  const { pathname, search } = useLocation()
  // «Повторити відповідь» in flight (or failed): the turn it replaces steps aside.
  const replacing = !!(pending?.retry || (failure?.retry && !pending))
  const all = chat?.messages ?? []
  const messages = replacing ? all.slice(0, -2) : all
  const empty = !messages.length && !pending && !failure
  const last = messages[messages.length - 1]
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport aria-label="Повідомлення чату" className="px-4">
          <MessageScrollerContent className={`${COLUMN} gap-4 py-4`} aria-label="Повідомлення">
            {empty && <Intro hasContext={hasContext} onStart={(s) => onStart(s.text, !!s.send)} />}
            {messages.map((m) => (
              <MessageScrollerItem
                key={m.id}
                messageId={m.id}
                scrollAnchor={m.role === 'user'}
                className={m.role === 'user' ? TURN : undefined}
              >
                <SavedMessage
                  message={m}
                  chatId={chat!.id}
                  onRetry={
                    m === last && m.role === 'assistant' && !pending && chat
                      ? () => retryLast(chat, `${pathname}${search}`)
                      : undefined
                  }
                />
              </MessageScrollerItem>
            ))}
            {pending && (
              <>
                <MessageScrollerItem messageId="pending-question" scrollAnchor className={TURN}>
                  <Question text={pending.text} context={pending.context} search={pending.search} />
                </MessageScrollerItem>
                <MessageScrollerItem messageId="pending-answer">
                  <Thinking search={pending.search} />
                </MessageScrollerItem>
              </>
            )}
            {failure && !pending && (
              <>
                <MessageScrollerItem messageId="failed-question" scrollAnchor className={TURN}>
                  <Question text={failure.text} context={failure.context} search={failure.search} />
                </MessageScrollerItem>
                <MessageScrollerItem messageId="failed-answer">
                  <Failure failure={failure} />
                </MessageScrollerItem>
              </>
            )}
            {footer}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
