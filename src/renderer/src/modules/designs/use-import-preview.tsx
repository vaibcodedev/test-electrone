import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import type { FileSource } from '@shared/domain/designs'
import { api } from '@/lib/api'
import { toFileSources } from '@/lib/files'
import { fmtBytes, plural } from '@/lib/format'
import { reportError } from '@/lib/error-reporting'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { isVideoPath } from './media'

interface Preview {
  url: string
  name: string
  video: boolean
  /** «1440 × 900 · PNG · 412 КБ» — what the person is about to add. */
  meta: string
}

interface Pending {
  sources: FileSource[]
  previews: Preview[]
}

const kindOf = (mime: string, name: string): string =>
  (mime.split('/')[1] || name.split('.').pop() || '').toUpperCase()

/** Width × height of a picture behind an object URL (the clipboard path gets them from main). */
const sizeOf = (url: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(`${img.naturalWidth} × ${img.naturalHeight}`)
    img.onerror = () => resolve('')
    img.src = url
  })

/**
 * «З буфера» and Ctrl+V ask before adding: the picture is shown with its size, «Додати» imports exactly
 * these bytes (the clipboard may change meanwhile), «Скасувати» drops them. Drag-and-drop stays instant —
 * there the person already sees what they drop.
 */
export function useImportPreview(
  importSources: (sources: FileSource[]) => Promise<void>,
  confirmLabel: string
): {
  fromClipboard: () => Promise<void>
  fromFiles: (files: File[]) => Promise<void>
  dialog: ReactElement
} {
  const [pending, setPending] = useState<Pending | null>(null)
  // The last batch stays during the exit animation; its object URLs are released after that.
  const [shown, setShown] = useState<Pending | null>(null)
  if (pending && pending !== shown) setShown(pending)
  useEffect(() => {
    if (pending || !shown) return
    const t = setTimeout(() => {
      shown.previews.forEach((p) => URL.revokeObjectURL(p.url))
      setShown(null)
    }, 300)
    return () => clearTimeout(t)
  }, [pending, shown])

  const fromClipboard = async (): Promise<void> => {
    try {
      const image = await api.files.clipboardImage()
      if (!image) {
        toast.error('У буфері обміну немає картинки — скопіюйте її або зробіть скриншот')
        return
      }
      const ext = image.mime.split('/')[1] || 'png'
      const name = `clipboard.${ext}`
      // A copy backed by a plain ArrayBuffer: what Blob and the import's bytes source accept.
      const data = new Uint8Array(image.data)
      const url = URL.createObjectURL(new Blob([data], { type: image.mime }))
      const size = image.width && image.height ? `${image.width} × ${image.height}` : ''
      setPending({
        // «clipboard» as the name: the design gets no title and is named «Знімок …» like a pasted screenshot.
        sources: [{ kind: 'bytes', name, mime: image.mime, data }],
        previews: [
          {
            url,
            name,
            video: false,
            meta: [size, kindOf(image.mime, name), fmtBytes(data.byteLength)]
              .filter(Boolean)
              .join(' · ')
          }
        ]
      })
    } catch (e) {
      reportError(e, 'designs:clipboard-preview')
      toast.error((e as Error).message)
    }
  }

  const fromFiles = async (files: File[]): Promise<void> => {
    if (!files.length) return
    const previews = await Promise.all(
      files.map(async (f) => {
        const url = URL.createObjectURL(f)
        const video = f.type.startsWith('video/') || isVideoPath(f.name)
        const size = video ? '' : await sizeOf(url)
        return {
          url,
          name: f.name,
          video,
          meta: [size, kindOf(f.type, f.name), fmtBytes(f.size)].filter(Boolean).join(' · ')
        }
      })
    )
    setPending({ sources: await toFileSources(files), previews })
  }

  const n = shown?.previews.length ?? 0
  const one = shown?.previews[0]
  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">
            {n > 1
              ? `Додати ${n} ${plural(n, ['картинку', 'картинки', 'картинок'])}?`
              : 'Додати картинку?'}
          </DialogTitle>
          <DialogDescription>
            {n === 1 && one ? one.meta : 'Перевірте, що вставилося саме те.'}
          </DialogDescription>
        </DialogHeader>
        {n === 1 && one ? (
          <div className="grid max-h-[60vh] place-items-center overflow-hidden rounded-2xl bg-surface p-2.5">
            {one.video ? (
              <video
                src={one.url}
                className="max-h-[56vh] rounded-lg"
                muted
                autoPlay
                loop
                playsInline
              />
            ) : (
              <img src={one.url} alt="" className="max-h-[56vh] rounded-lg object-contain" />
            )}
          </div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto">
            {shown?.previews.map((p) => (
              <div key={p.url} className="flex flex-col gap-1 rounded-2xl bg-surface p-1.5">
                {p.video ? (
                  <video src={p.url} className="aspect-4/3 w-full rounded-xl object-cover" muted />
                ) : (
                  <img src={p.url} alt="" className="aspect-4/3 w-full rounded-xl object-cover" />
                )}
                <span className="truncate px-1 text-meta text-muted-foreground" title={p.name}>
                  {p.meta}
                </span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="soft" onClick={() => setPending(null)}>
            Скасувати
          </Button>
          <Button
            variant="lime"
            autoFocus
            onClick={() => {
              const batch = pending
              setPending(null)
              if (batch) void importSources(batch.sources)
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return { fromClipboard, fromFiles, dialog }
}
