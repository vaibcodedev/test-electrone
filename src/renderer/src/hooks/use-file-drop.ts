import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { FileSource } from '@shared/domain/designs'
import { toFileSources } from '@/lib/files'

/**
 * Drag & drop of files onto an element. Returns props to spread and an `isOver` flag.
 * `onFiles` receives API-ready sources (absolute path for disk files, bytes for browser drags).
 */
export function useFileDrop(onFiles: (sources: FileSource[]) => void, opts: { accept?: (f: File) => boolean } = {}) {
  const [isOver, setOver] = useState(false)
  const depth = useRef(0)
  const props = {
    onDragEnter: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      depth.current++
      setOver(true)
    },
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault()
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setOver(false)
    },
    onDrop: async (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const files = Array.from(e.dataTransfer.files).filter((f) => !opts.accept || opts.accept(f))
      if (files.length) onFiles(await toFileSources(files))
    }
  }
  return { isOver, props }
}

/**
 * Ctrl+V of images/files anywhere on the page (ignored while typing in inputs).
 * Screenshots copied from the OS arrive as File objects without a path → sent as bytes.
 */
export function usePasteFiles(onFiles: (sources: FileSource[]) => void, enabled = true): void {
  const ref = useRef(onFiles)
  useEffect(() => {
    ref.current = onFiles
  })
  useEffect(() => {
    if (!enabled) return
    const onPaste = async (e: ClipboardEvent): Promise<void> => {
      const target = e.target as HTMLElement | null
      if (target && (target.closest('input, textarea, [contenteditable], .cm-editor'))) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (!files.length) return
      e.preventDefault()
      ref.current(await toFileSources(files))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [enabled])
}
