import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type PreviewLanguage = 'tsx' | 'jsx' | 'html'
export type PreviewBg = 'light' | 'dark' | 'grid'

/**
 * Live component preview in a sandboxed iframe (allow-scripts only → opaque origin, no app API).
 * Available imports inside: react, lucide-react, clsx, tailwind-merge, class-variance-authority, '@/lib/utils' (cn).
 * Tailwind classes work via @tailwindcss/browser.
 */
export function LivePreview({
  code,
  language,
  bg = 'light',
  className,
  debounce = 350
}: {
  code: string
  language: PreviewLanguage
  bg?: PreviewBg
  className?: string
  debounce?: number
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const src = new URL('./preview.html', window.location.href).href.replace(/#.*$/, '')

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      if (e.source !== frame.current?.contentWindow) return
      const data = e.data as { source?: string; ready?: boolean; ok?: boolean; error?: string }
      if (data?.source !== 'vault-preview') return
      if (data.ready) setReady(true)
      else setStatus({ ok: !!data.ok, error: data.error })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      frame.current?.contentWindow?.postMessage({ type: 'render', code, language, bg }, '*')
    }, debounce)
    return () => clearTimeout(t)
  }, [code, language, bg, ready, debounce])

  return (
    <div className={cn('relative flex min-h-0 flex-col overflow-hidden rounded-2xl ring-1 ring-border', className)}>
      <iframe
        ref={frame}
        title="Превью компонента"
        src={src}
        sandbox="allow-scripts"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
      {status && (
        <Badge variant={status.ok ? 'lime' : 'destructive'} className="absolute top-2 left-2" title={status.error}>
          {status.ok ? <CheckCircle2 /> : <AlertTriangle />}
          {status.ok ? 'Рендерится' : 'Ошибка'}
        </Badge>
      )}
    </div>
  )
}
