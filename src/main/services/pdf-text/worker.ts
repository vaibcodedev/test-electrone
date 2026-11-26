/**
 * Worker thread (electron-vite `?modulePath`, see run-worker.ts): reads one PDF and posts its text back.
 * The file is read here, so a 100 MB PDF is never copied through the main process.
 */
import { readFile, stat } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { extractPdfText, type PdfLimits, type PdfTextResult } from './extract'

export interface PdfJob {
  path: string
  limits: PdfLimits
}

async function run({ path, limits }: PdfJob): Promise<PdfTextResult> {
  if ((await stat(path)).size > limits.maxBytes) return { status: 'too-large', text: '' }
  return extractPdfText(await readFile(path), limits)
}

run(workerData as PdfJob).then(
  (result) => parentPort?.postMessage(result),
  (e: unknown) =>
    parentPort?.postMessage({
      status: 'failed',
      text: '',
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    } satisfies PdfTextResult)
)
