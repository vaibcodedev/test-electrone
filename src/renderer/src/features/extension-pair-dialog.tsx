import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Puzzle } from 'lucide-react'
import { toast } from 'sonner'
import type { MainEvents } from '@shared/api'
import { queryClient, useApi, useApiMutation } from '@/lib/query'
import { useMainEvent } from '@/hooks/use-main-events'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'

const QUERY_KEY = ['capture', 'pairRequest', null]
/**
 * «Дозволити» wakes up a moment after the question appears (or changes): a click or Enter meant for the window
 * underneath — the dialog pops up unasked, over whatever the person was doing — never grants access.
 */
const ARM_DELAY_MS = 1000

/** «Запит діє ще 45 с». Keyed by the request: every new question starts its own clock. */
function TimeLeft({ expiresAt }: { expiresAt: number }): ReactElement {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return (
    <p className="text-caption text-muted-foreground">
      {left > 0 ? `Запит діє ще ${left} с` : 'Час на відповідь минув'}
    </p>
  )
}

/** «Дозволити», disabled for ARM_DELAY_MS after it mounts. Keyed by the request, like TimeLeft. */
function AllowButton({ onAllow }: { onAllow: () => void }): ReactElement {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ARM_DELAY_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <AlertDialogAction
      disabled={!armed}
      onClick={(e) => {
        // Not through onOpenChange: that path means «Відхилити».
        e.preventDefault()
        onAllow()
      }}
    >
      Дозволити
    </AlertDialogAction>
  )
}

/**
 * «Дозволити розширенню доступ до Vault?» — the extension asked to pair (POST /pair in main). Main brings the
 * window up and pushes every change (`capture:pair`); the request is read once on start too, in case it came
 * while the window was still loading. Focus starts on «Відхилити»: the dialog appears without the person
 * asking for it in this window, so a stray Enter or Space must refuse (harmless — the extension asks again),
 * never grant. Esc refuses as well.
 */
export function ExtensionPairDialog(): ReactElement {
  const { data: request } = useApi('capture', 'pairRequest')
  const onPair = useCallback((p: MainEvents['capture:pair']) => {
    queryClient.setQueryData(QUERY_KEY, p)
  }, [])
  useMainEvent('capture:pair', onPair)

  /** The id answered here: the dialog closes at once, before main confirms. */
  const [answered, setAnswered] = useState<string | null>(null)
  const shownId = useRef<string | null>(null)
  const denyRef = useRef<HTMLButtonElement>(null)
  const answer = useApiMutation('capture', 'answerPair', {
    onSuccess: (_data, { allow }) => {
      if (allow) toast.success('Розширення під’єднано')
      else toast.info('Доступ відхилено')
    }
  })

  // The question went away without an answer from here: time ran out (a replaced one shows the new question).
  useEffect(() => {
    const previous = shownId.current
    shownId.current = request?.id ?? null
    if (previous && !request && previous !== answered)
      toast.info('Час на відповідь минув', {
        description: 'Щоб під’єднати розширення, натисніть у ньому «Під’єднати до Vault» ще раз.'
      })
  }, [request, answered])

  const reply = (allow: boolean): void => {
    if (!request || answered === request.id) return
    setAnswered(request.id)
    answer.mutate({ id: request.id, allow })
  }

  const open = !!request && answered !== request.id
  const known = !!request?.vault
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // «Відхилити» and Esc close the dialog: both refuse.
        if (!next) reply(false)
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          denyRef.current?.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Дозволити розширенню доступ до Vault?</AlertDialogTitle>
          <AlertDialogDescription className="wrap-anywhere">
            {known
              ? 'Розширення для браузера просить ключ, щоб зберігати сторінки у Vault. Дозвольте, якщо щойно натиснули в ньому «Під’єднати до Vault».'
              : 'Це не розширення, яке постачається з Vault. Дозвольте, лише якщо встановили його самі й щойно натиснули в ньому «Під’єднати до Vault».'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {request && (
          <>
            <Item variant="muted" size="sm">
              <ItemMedia variant="icon">
                <Puzzle />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>{known ? 'Розширення Vault' : 'Невідоме розширення'}</ItemTitle>
                <ItemDescription className="font-mono text-caption wrap-anywhere">
                  {request.origin}
                </ItemDescription>
              </ItemContent>
            </Item>
            <TimeLeft key={request.id} expiresAt={request.expiresAt} />
          </>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel ref={denyRef} variant="soft">
            Відхилити
          </AlertDialogCancel>
          <AllowButton key={request?.id} onAllow={() => reply(true)} />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
