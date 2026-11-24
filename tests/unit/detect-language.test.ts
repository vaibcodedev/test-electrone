import { describe, expect, it } from 'vitest'
import { detectLanguage } from '@/components/common/code'

describe('detectLanguage', () => {
  it.each([
    ['typescript', "interface User { id: string }\nconst u: User = { id: '1' }"],
    ['typescript', 'type Id = string\nexport const toId = (v: unknown): Id => String(v)'],
    ['tsx', 'export function A({ x }: Props) {\n  return <div>{x}</div>\n}'],
    ['jsx', 'export default function App() {\n  return <div className="a">hi</div>\n}'],
    ['javascript', 'const x = [1, 2, 3].map((n) => n * 2)\nconsole.log(x)'],
    ['javascript', "import fs from 'fs'\nfs.readFileSync('a')"],
    ['json', '{"a": 1, "b": [true, null]}'],
    ['json', '[{"a": 1}]'],
    ['sql', "SELECT id, title FROM ideas WHERE status = 'inbox';"],
    ['sql', "select id, title from ideas where status = 'inbox'"],
    ['sql', 'CREATE TABLE t (id integer primary key)'],
    [
      'graphql',
      'query Collection($handle: String!) {\n  collection(handle: $handle) { id title }\n}'
    ],
    ['graphql', 'mutation { addTodo(text: "x") { id } }'],
    ['markdown', '# Title\n\n- one\n- two\n\nSome **bold** text.'],
    ['html', '<section class="hero">\n  <h1>Hi</h1>\n</section>'],
    [
      'html',
      "<div id=\"app\"></div>\n<script>document.getElementById('app').textContent = 'x'</script>"
    ],
    ['liquid', '{% if product.available %}\n  {{ product.title }}\n{% endif %}'],
    ['css', '.btn {\n  color: red;\n  padding: 4px 8px;\n}\n\n.btn:hover {\n  color: blue;\n}']
  ])('%s: %j', (lang, code) => {
    expect(detectLanguage(code)).toBe(lang)
  })

  describe('export: JavaScript vs bash', () => {
    it('`export { … }` is JavaScript, not bash', () => {
      expect(detectLanguage("export { a, b } from './x'")).toBe('javascript')
      expect(detectLanguage('const a = 1\nconst b = 2\nexport { a, b }')).toBe('javascript')
      expect(detectLanguage("export * from './x'")).toBe('javascript')
    })
    it('`export FOO=1` is bash', () => {
      expect(detectLanguage('export NODE_ENV=production\nnpm run build')).toBe('bash')
      expect(detectLanguage('export FOO=1')).toBe('bash')
    })
    it('commands and shebangs are bash', () => {
      expect(detectLanguage('npm i motion')).toBe('bash')
      expect(detectLanguage('$ git status')).toBe('bash')
      expect(detectLanguage('#!/bin/sh\necho hi')).toBe('bash')
    })
  })

  it('returns null when unsure (plain prose, too short)', () => {
    expect(detectLanguage('Just some words here')).toBeNull()
    expect(detectLanguage('x')).toBeNull()
    expect(detectLanguage('   ')).toBeNull()
  })

  // Regression (was a bug): an inline props type `({ x }: { x: string })` has no TS_RE marker (`: string }` — `}` is not in the
  // follow-set `[,)=;{|<>]`), so a TSX component is suggested as JSX. code.tsx TS_RE.
  it('TSX with an inline object props type is detected as tsx', () => {
    expect(
      detectLanguage('export function A({ x }: { x: string }) {\n  return <div>{x}</div>\n}')
    ).toBe('tsx')
  })

  // Regression (was a bug): JS_RE / SHELL_RE are multiline and run before MD_RE, so lines inside a ``` fence decide the language
  // of the whole markdown document. A README pasted into a note is suggested as JavaScript / bash.
  it('markdown with a ```js fence is markdown', () => {
    const md =
      "# Install\n\n```bash\nnpm i motion\n```\n\nThen:\n\n```js\nimport { animate } from 'motion'\n```"
    expect(detectLanguage(md)).toBe('markdown')
  })
  it('markdown with a ```bash fence is markdown', () => {
    expect(detectLanguage('# Setup\n\nRun this:\n\n```bash\nnpm i\n```')).toBe('markdown')
  })

  // Regression (was a bug): the html branch rejects any `{…}`, so a page with inline CSS (`body{margin:0}`) becomes tsx.
  it('an HTML page with an inline <style> is html', () => {
    const html =
      '<!doctype html>\n<html><head><style>body{margin:0}</style></head><body><p>Hi</p></body></html>'
    expect(detectLanguage(html)).toBe('html')
  })
})
