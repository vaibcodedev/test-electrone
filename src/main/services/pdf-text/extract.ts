/**
 * Text layer of a PDF for global search, through unpdf (a serverless build of Mozilla PDF.js: MIT + Apache-2.0,
 * no native code, no dependencies). PDF.js under Node parses on the calling thread, so Vault runs this inside a
 * worker thread (worker.ts) — never on the main process itself.
 */

/** What became of a file: `empty` — no text layer (a scan), `encrypted` — needs a password. */
export type PdfTextStatus = 'ok' | 'empty' | 'encrypted' | 'too-large' | 'failed'

export interface PdfTextResult {
  status: PdfTextStatus
  /** The text (≤ maxChars); '' unless `ok`. */
  text: string
  /** Why it failed, for the log: the library's message, never the document's text. */
  error?: string
}

export interface PdfLimits {
  /** Bigger files are not opened (they are mostly scans, and PDF.js keeps the whole file in memory). */
  maxBytes: number
  /** Pages read at most. */
  maxPages: number
  /** Characters kept per file (the rest of a book is not searchable). */
  maxChars: number
}

export const PDF_LIMITS: PdfLimits = {
  maxBytes: 100 * 1024 * 1024,
  maxPages: 2000,
  maxChars: 200_000
}

/**
 * Plain searchable text: control characters out (\u0001/\u0002 are the index's snippet markers), runs of spaces
 * collapsed, at most one blank line in a row.
 */
export function cleanPdfText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- the point is to drop control characters
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e)
}

/** Reads the text of a PDF page by page, stopping at the limits. Never throws: a bad file is a status. */
export async function extractPdfText(
  data: Uint8Array,
  limits: PdfLimits = PDF_LIMITS
): Promise<PdfTextResult> {
  if (data.byteLength > limits.maxBytes) return { status: 'too-large', text: '' }
  // PDF.js refuses a Node Buffer («provide binary data as Uint8Array»): the same bytes as a plain view.
  if (Buffer.isBuffer(data)) data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  const { getDocumentProxy } = await import('unpdf')
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    // Images are never decoded for text, and a huge one must not eat the memory. Verbosity 0: PDF.js warnings
    // (odd fonts…) would go to the console for every file.
    pdf = await getDocumentProxy(data, {
      stopAtErrors: false,
      maxImageSize: 1,
      enableXfa: false,
      verbosity: 0
    })
  } catch (e) {
    const name = (e as { name?: string } | null)?.name
    return {
      status: name === 'PasswordException' ? 'encrypted' : 'failed',
      text: '',
      error: errorText(e)
    }
  }
  try {
    const parts: string[] = []
    let length = 0
    const pages = Math.min(pdf.numPages, limits.maxPages)
    for (let n = 1; n <= pages && length < limits.maxChars; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        pageText += item.str
        if (item.hasEOL) pageText += '\n'
      }
      page.cleanup()
      pageText = cleanPdfText(pageText)
      if (pageText) {
        parts.push(pageText)
        length += pageText.length + 1
      }
    }
    const text = parts.join('\n').slice(0, limits.maxChars)
    return text ? { status: 'ok', text } : { status: 'empty', text: '' }
  } catch (e) {
    return { status: 'failed', text: '', error: errorText(e) }
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined)
  }
}
