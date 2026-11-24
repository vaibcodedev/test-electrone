import { useEffect } from 'react'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { reportError } from '@/lib/error-reporting'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

/** Route-level error screen (React Router errorElement). Logs the error to the main log file. */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)

  useEffect(() => {
    reportError(error, 'route')
  }, [error])

  return (
    <div className="grid h-full place-items-center p-8">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-14 rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-6" />
          </EmptyMedia>
          <EmptyTitle className="text-[15px] font-medium">Экран не открылся</EmptyTitle>
          <EmptyDescription className="text-[13px] break-words">
            {message}. Ошибка записана в журнал — данные не пострадали.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button variant="lime" onClick={() => window.location.reload()}>
            <RotateCcw /> Перезагрузить
          </Button>
          <Button variant="soft" onClick={() => navigate('/')}>
            На главную
          </Button>
          <Button variant="ghost" onClick={() => api.settings.openLogs()}>
            Открыть журнал
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
