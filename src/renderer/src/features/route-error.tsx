import { useEffect, type ReactElement } from 'react'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { reportError } from '@/lib/error-reporting'
import { api } from '@/lib/api'
import { EmptyState } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

/** A page whose main query failed: says so and retries (the global toast also logs it). */
export function LoadError({ title, onRetry }: { title: string; onRetry: () => void }): ReactElement {
  return (
    <EmptyState
      icon={TriangleAlert}
      title={title}
      hint="Спробуйте ще раз — дані на місці."
      action={
        <Button variant="lime" onClick={onRetry}>
          Повторити
        </Button>
      }
      className="h-full"
    />
  )
}

/** Unknown address (route `*` inside the shell, or a 404 at the root): not an error, nothing goes to the log. */
export function NotFoundPage(): ReactElement {
  const navigate = useNavigate()
  return (
    <div className="grid h-full place-items-center p-8">
      <EmptyState
        illustration="map-pin" illustrationSize="lg"
        title="Такої сторінки немає"
        hint="Можливо, посилання застаріло або запис видалено."
        action={
          <Button variant="lime" onClick={() => navigate('/')}>
            На головну
          </Button>
        }
      />
    </div>
  )
}

/** Route-level error screen (React Router errorElement). Logs the error to the main log file. */
export function RouteError(): ReactElement {
  const error = useRouteError()
  const navigate = useNavigate()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  // After an update or a rebuild the old window asks for screen files that no longer exist: just reload.
  const stale =
    error instanceof Error && /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(error.message)
  const message = stale
    ? 'Vault оновився, а вікно ще зі старою версією. Перезавантажте його'
    : isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)

  useEffect(() => {
    if (stale || notFound) return
    reportError(error, 'route')
  }, [error, stale, notFound])

  if (notFound) return <NotFoundPage />

  return (
    // data-route-error: tests and audits detect the crash screen by it, not by its text (the guide quotes it).
    <div data-route-error className="grid h-full place-items-center p-8">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-14 rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-6" />
          </EmptyMedia>
          <EmptyTitle className="text-lead font-medium">{stale ? 'Потрібне перезавантаження' : 'Екран не відкрився'}</EmptyTitle>
          <EmptyDescription className="text-body wrap-break-word">
            {stale ? `${message} — дані не постраждали.` : `${message}. Помилку записано в журнал — дані не постраждали.`}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button variant="lime" onClick={() => window.location.reload()}>
            <RotateCcw /> Перезавантажити
          </Button>
          <Button variant="soft" onClick={() => navigate('/')}>
            На головну
          </Button>
          <Button variant="ghost" onClick={() => api.settings.openLogs()}>
            Відкрити журнал
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
