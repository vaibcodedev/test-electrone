import { Worker } from 'node:worker_threads'
import workerPath from './worker?modulePath'
import { PDF_LIMITS, type PdfLimits, type PdfTextResult } from './extract'
import type { PdfJob } from './worker'

/** A PDF that takes longer than this is given up (a pathological file must not hold the queue forever). */
const TIMEOUT_MS = 120_000
/** Heap of the worker: a hostile file ends that thread (status «failed»), never the app. */
const HEAP_MB = 1024

/**
 * Extracts a PDF's text on a worker thread of its own: PDF.js parses synchronously, and on the main process a big
 * file would freeze every window. One thread per file — it is gone with all its memory once the file is read.
 * Never rejects: a crash, an out-of-memory or the timeout come back as `failed`. `signal` (pause before a backup
 * restore) ends the thread; the promise settles only once the thread has stopped and let go of the file.
 */
export function extractPdfInWorker(
  path: string,
  signal: AbortSignal,
  limits: PdfLimits = PDF_LIMITS
): Promise<PdfTextResult & { aborted?: boolean }> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve({ status: 'failed', text: '', aborted: true })
    let settled = false
    const worker = new Worker(workerPath, {
      workerData: { path, limits } satisfies PdfJob,
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB }
    })
    const finish = (result: PdfTextResult & { aborted?: boolean }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      void worker
        .terminate()
        .catch(() => undefined)
        .then(() => resolve(result))
    }
    const onAbort = (): void => finish({ status: 'failed', text: '', aborted: true })
    signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(
      () => finish({ status: 'failed', text: '', error: `timeout after ${TIMEOUT_MS} ms` }),
      TIMEOUT_MS
    )
    worker.once('message', (result: PdfTextResult) => finish(result))
    worker.once('error', (e) =>
      finish({ status: 'failed', text: '', error: `${e.name}: ${e.message}` })
    )
    worker.once('exit', (code) =>
      finish({ status: 'failed', text: '', error: `worker exited with code ${code}` })
    )
  })
}
