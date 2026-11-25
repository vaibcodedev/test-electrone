import { memo, type ReactElement, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { CircleSlash, Database, RotateCcw, Settings, Sparkles } from 'lucide-react'
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
import { EmptyState } from '@/components/common/page'
import { EntityRow } from '@/components/common/entity-link'
import { Markdown } from '@/components/common/markdown'
import { plural } from '@/lib/format'
import { ActionCard } from './action-card'
import { sendMessage, useChatSession, type Outgoing } from './session'

function Question({
  text,
  context,
  search
}: {
  text: string
  context: EntityRef | null
  search: boolean
}): ReactElement {
  const notes = [
    context ? `Контекст: ${ENTITY_META[context.type].label.toLocaleLowerCase('uk')}` : '',
    search ? 'з пошуком у базі' : ''
  ].filter(Boolean)
  return (
    <Message align="end">
      <MessageContent>
        <Bubble align="end">
          <BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
        </Bubble>
        {notes.length > 0 && (
          <MessageFooter className="max-w-[85%] truncate">{notes.join(' · ')}</MessageFooter>
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

/** One saved turn. Memoized: typing in the composer or a new answer doesn't re-render the older ones. */
const SavedMessage = memo(function SavedMessage({
  message,
  chatId
}: {
  message: AiChatMessage
  chatId: string
}): ReactElement {
  if (message.role === 'user')
    return <Question text={message.text} context={message.context} search={message.searched} />
  return (
    <Message align="start">
      <MessageContent>
        {message.text && (
          <Bubble variant="ghost">
            <BubbleContent>
              <Markdown source={message.text} />
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
                search: failure.search
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

/** A new chat: what the chat can do, and a few starts that fill the composer. */
function Intro({
  hasContext,
  onStart
}: {
  hasContext: boolean
  onStart: (text: string) => void
}): ReactElement {
  const starts = hasContext
    ? ['Підсумуй цей запис', 'Запропонуй мітки для цього запису', 'Додай до запису план дій']
    : ['Додай ідею: ', 'Створи картку: ', 'Додай подію на завтра о 10:00: ']
  return (
    <EmptyState
      icon={Sparkles}
      title="Чим допомогти?"
      hint="Спитайте про що завгодно або попросіть додати ідею, нотатку, сніпет, картку чи подію. ШІ покаже, що саме зміниться, — застосовуєте ви."
      className="my-auto py-8"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {starts.map((s) => (
            <Button key={s} variant="soft" size="sm" onClick={() => onStart(s)}>
              {s.replace(/:\s*$/, '…')}
            </Button>
          ))}
        </div>
      }
    />
  )
}

/**
 * The conversation (shadcn MessageScroller: follows the answer, keeps the question in view, «до останнього»
 * when scrolled away). The content is a `log` region: a new answer is read out by a screen reader.
 */
export function ChatThread({
  chat,
  hasContext,
  onStart,
  footer
}: {
  chat: AiChat | null
  hasContext: boolean
  onStart: (text: string) => void
  footer?: ReactNode
}): ReactElement {
  const pending = useChatSession((s) => s.pending)
  const failure = useChatSession((s) => s.failure)
  const messages = chat?.messages ?? []
  const empty = !messages.length && !pending && !failure
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport aria-label="Повідомлення чату" className="px-4">
          <MessageScrollerContent className="py-3" aria-label="Повідомлення">
            {empty && <Intro hasContext={hasContext} onStart={onStart} />}
            {messages.map((m) => (
              <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === 'user'}>
                <SavedMessage message={m} chatId={chat!.id} />
              </MessageScrollerItem>
            ))}
            {pending && (
              <>
                <MessageScrollerItem messageId="pending-question" scrollAnchor>
                  <Question text={pending.text} context={pending.context} search={pending.search} />
                </MessageScrollerItem>
                <MessageScrollerItem messageId="pending-answer">
                  <Thinking search={pending.search} />
                </MessageScrollerItem>
              </>
            )}
            {failure && !pending && (
              <>
                <MessageScrollerItem messageId="failed-question" scrollAnchor>
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
