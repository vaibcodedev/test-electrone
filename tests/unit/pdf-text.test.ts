/** Reading the text layer of a PDF (unpdf / PDF.js under plain Node, as in the worker thread). */
import { describe, expect, it } from 'vitest'
import { cleanPdfText, extractPdfText, PDF_LIMITS } from '@main/services/pdf-text/extract'
import { passage } from '@main/services/pdf-text/passage'
import { makePdf } from './support/pdf'

describe('extractPdfText', () => {
  it('reads every page', async () => {
    const r = await extractPdfText(makePdf([['Invoice for consulting'], ['Second page quokka']]))
    expect(r.status).toBe('ok')
    expect(r.text).toContain('Invoice for consulting')
    expect(r.text).toContain('quokka')
  })

  it('a PDF without a text layer (a scan) is empty, not an error', async () => {
    expect(await extractPdfText(makePdf([[]]))).toEqual({ status: 'empty', text: '' })
  })

  it('a broken file is a status, never an exception', async () => {
    const r = await extractPdfText(new TextEncoder().encode('%PDF-1.4 not really a pdf'))
    expect(r.status).toBe('failed')
    expect(r.text).toBe('')
  })

  it('keeps to the limits: characters, pages and file size', async () => {
    const pages = Array.from({ length: 5 }, (_, i) => [`page${i} ${'word '.repeat(20)}`])
    const short = await extractPdfText(makePdf(pages), { ...PDF_LIMITS, maxChars: 50 })
    expect(short.text.length).toBeLessThanOrEqual(50)
    const twoPages = await extractPdfText(makePdf(pages), { ...PDF_LIMITS, maxPages: 2 })
    expect(twoPages.text).toContain('page1')
    expect(twoPages.text).not.toContain('page2')
    const big = await extractPdfText(makePdf(pages), { ...PDF_LIMITS, maxBytes: 10 })
    expect(big.status).toBe('too-large')
  })

  it('drops the snippet markers and control characters, collapses spaces', () => {
    expect(cleanPdfText('a\u0001b\u0002  c\t\td\n\n\n\ne ')).toBe('a b c d\n\ne')
  })
})

describe('passage', () => {
  it('cuts a few words around the first match and marks every match in it', () => {
    const text = `${'lead '.repeat(50)}the Quokka report quokkas here ${'tail '.repeat(50)}`
    const p = passage(text, ['quokka'])
    expect(p.startsWith('…')).toBe(true)
    expect(p.endsWith('…')).toBe(true)
    expect(p).toContain('\u0001Quokka\u0002 report \u0001quokkas\u0002')
    expect(p.length).toBeLessThan(120)
  })

  it('matches word starts only, ignoring case and accents, in Cyrillic too', () => {
    expect(passage('superquokka quokka', ['quokka'])).toBe('superquokka \u0001quokka\u0002')
    expect(passage('Résumé', ['resume'])).toBe('\u0001Résumé\u0002')
    expect(passage('Договір про Співпрацю', ['співпр'])).toBe('Договір про \u0001Співпрацю\u0002')
  })

  it('finds an accented match far into a long text', () => {
    const text = `${'İstanbul lead '.repeat(2000)}the Zürich office ${'tail '.repeat(50)}`
    expect(passage(text, ['zurich'])).toContain('the \u0001Zürich\u0002 office')
  })

  it('without a match: the beginning of the text', () => {
    expect(passage('one two three', ['zzz'])).toBe('one two three')
  })
})
