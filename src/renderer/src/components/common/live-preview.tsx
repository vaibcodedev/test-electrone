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
  debounce = 350,
  showStatus = true,
  quiet = false,
  onStatus
}: {
  code: string
  language: PreviewLanguage
  bg?: PreviewBg
  className?: string
  debounce?: number
  /** false = no status badge (gallery tiles draw their own). */
  showStatus?: boolean
  /** A scaled-down tile: the sandbox reports an error only to `onStatus`, without drawing its unreadable block. */
  quiet?: boolean
  /** Render result for the parent: ok / error message. */
  onStatus?: (status: { ok: boolean; error?: string }) => void
}) {
  const onStatusRef = useRef(onStatus)
  useEffect(() => {
    onStatusRef.current = onStatus
  })
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
      else {
        const next = { ok: !!data.ok, error: data.error }
        setStatus(next)
        onStatusRef.current?.(next)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      frame.current?.contentWindow?.postMessage({ type: 'render', code, language, bg, quiet }, '*')
    }, debounce)
    return () => clearTimeout(t)
  }, [code, language, bg, quiet, ready, debounce])

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-col overflow-hidden rounded-2xl ring-1 ring-border',
        className
      )}
    >
      <iframe
        ref={frame}
        title="Прев’ю компонента"
        src={src}
        sandbox="allow-scripts"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
      {/* On a card plate: a tinted status badge didn't read on the white, dark and grid backgrounds of the
          preview. Empty code has nothing to report (the preview reports ok for it). */}
      {showStatus && status && code.trim() && (
        <Badge
          variant="soft"
          className="absolute top-2 left-2 bg-card text-foreground shadow-sm"
          title={status.error}
        >
          {status.ok ? (
            <CheckCircle2 className="text-success" />
          ) : (
            <AlertTriangle className="text-destructive" />
          )}
          {status.ok ? 'Працює' : 'Помилка'}
        </Badge>
      )}
    </div>
  )
}
