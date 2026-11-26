/**
 * Tiny valid PDFs for tests (unit and e2e): one page per entry, each line set in the standard Helvetica font.
 * Latin text only — Helvetica without an embedded font has no Cyrillic glyphs. `[]` gives a PDF with an empty
 * page: no text layer at all, like a scanned document.
 */
export function makePdf(pages: string[][]): Buffer {
  const pageList = pages.length ? pages : [[]]
  const objects: string[] = []
  const add = (body: string): number => objects.push(body)
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // pages, filled in below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const kids: number[] = []
  for (const lines of pageList) {
    const ops = lines
      .map((l, i) => `${i ? '0 -16 Td ' : ''}(${l.replace(/[\\()]/g, (c) => '\\' + c)}) Tj`)
      .join('\n')
    const stream = lines.length ? `BT /F1 12 Tf 72 720 Td\n${ops}\nET` : ''
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
    )
    kids.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`
      )
    )
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
