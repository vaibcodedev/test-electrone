// Guesses the language of selected code for «Сніпет», offline and without libraries.
// The rules are detectLanguage() from src/renderer/src/lib/code-language.ts without the highlight.js
// fallback: keep them in step. Ids are SNIPPET_LANGUAGES (src/shared/domain/snippets.ts); JSX is saved as TSX.

/** Snippet languages in the order the popup lists them, with their labels in the app. */
export const LANGUAGES = [
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['tsx', 'TSX / JSX'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['json', 'JSON'],
  ['bash', 'Bash'],
  ['sql', 'SQL'],
  ['graphql', 'GraphQL'],
  ['liquid', 'Liquid'],
  ['markdown', 'Markdown'],
  ['text', 'Текст']
]

// `export` counts as shell only as `export VAR=…`: `export { … }` / `export const` is JavaScript.
const SHELL_RE =
  /^(\$ |#!\/|(sudo|npm|npx|pnpm|yarn|bun|git|cd|ls|mkdir|rm|cp|mv|curl|wget|docker|kubectl|echo|brew|pip|apt|chmod)\s|export\s+[A-Z_][A-Z0-9_]*=)/m
/** Unmistakable JS/TS statements; checked before shell/SQL, whose keywords can also start a line of code. */
const JS_RE =
  /^\s*(import\s[^;]*\sfrom\s|import\s+['"]|export\s+(default|const|let|var|function|class|type|interface|async|\{|\*)|(const|let|var)\s+[\w{[]|(async\s+)?function\s*\w*\s*\(|class\s+\w+)/m
/** TypeScript-only syntax: interfaces, type aliases, annotations, `as const`, generic calls. */
const TS_RE =
  /\binterface\s+\w+|\btype\s+\w+\s*=|:\s*(string|number|boolean|void|unknown|any|React\.\w+|[A-Z]\w*(<[^>]*>)?)(\[\])?\s*[,)=;{}|<>]|:\s*\{\s*\w+\??:\s*\w|\w\?:\s|\bas\s+const\b|\w<[A-Z]\w*(\[\])?>\(/
const SQL_RE =
  /^\s*(select\s.+\sfrom\s|insert\s+into\s|update\s+\w+\s+set\s|delete\s+from\s|create\s+(table|index|view)\s|alter\s+table\s|with\s+\w+\s+as\s*\()/im
const MD_RE = /^(#{1,6}\s+\S|[-*+]\s+\S|\d+\.\s+\S|>\s|```)/m
const GRAPHQL_RE = /^\s*(query|mutation|subscription|fragment)\b[^{]*\{/m
/** A rule `selector { prop: value }` or an at-rule; JS is ruled out before this one. */
const CSS_RE =
  /^\s*(@(media|import|keyframes|layer|tailwind|apply|font-face|supports|container)\b|[\w.#:*\-[\]="'>+~,\s()]+\{\s*[\w-]+\s*:\s*[^;{}]+;)/m
// A tag starts after a bracket, an operator or a line start; `useState<T>` / `Array<Item>` are TypeScript generics.
// (The renderer's detectLanguage still reads `useDebounce<T>(…)` as JSX.)
const JSX_RE = /\breturn\s*\(?\s*<|(?<![\w$.])<[A-Z][\w.]*[\s/>]|<\/\w+>/
const JSX_TAG_RE = /(?<![\w$.])<[A-Z]\w*[\s/>]/

/** One of LANGUAGES' ids, or null when unsure (the popup then saves «Текст» and lets the user pick). */
export function guessLanguage(code) {
  const src = String(code ?? '').trim()
  if (src.length < 2) return null
  if (/^[[{]/.test(src)) {
    try {
      JSON.parse(src)
      return 'json'
    } catch {
      /* an object literal or a block: keep guessing */
    }
  }
  if (/^\{%|\{\{[^}]+\}\}/.test(src) && /\{%\s*(if|for|assign|render|schema)\b/.test(src))
    return 'liquid'
  if (/^</.test(src)) {
    // Braces inside <style>/<script> are CSS/JS, not JSX expressions.
    const markup = src.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    if (
      /^<!doctype|^<html|^<(div|section|span|p|ul|head|body|meta|link|script|style)[\s>]/i.test(
        src
      ) &&
      !/\bclassName=|\{[^}]*\}/.test(markup)
    )
      return 'html'
    return 'tsx'
  }
  // Markdown with fenced code: the fence content would otherwise look like JS/bash line by line.
  if (/^```/m.test(src)) return 'markdown'
  if (JS_RE.test(src))
    return JSX_RE.test(src) ? 'tsx' : TS_RE.test(src) ? 'typescript' : 'javascript'
  if (GRAPHQL_RE.test(src)) return 'graphql'
  if (SQL_RE.test(src)) return 'sql'
  if (SHELL_RE.test(src)) return 'bash'
  if (CSS_RE.test(src)) return 'css'
  if (/\breturn\s*\(?\s*</.test(src) || JSX_TAG_RE.test(src)) return 'tsx'
  if (MD_RE.test(src) && !/[;{}]\s*$/m.test(src)) return 'markdown'
  return null
}

/** Statements of languages the app has no id for (Python, Go, Rust, C…): still code, saved as «Текст». */
const OTHER_CODE_RE =
  /^\s*(def\s+\w+\s*\(|from\s+[\w.]+\s+import\s|package\s+\w+|func\s+\w*\s*\(|fn\s+\w+|pub\s+(fn|struct|enum)\s|public\s+(static\s+)?(class|void|int)\s|#include\s*<|using\s+System)/m

/** Code rather than prose: a known language, a known statement, or indented lines full of brackets. */
export function looksLikeCode(text) {
  const src = String(text ?? '').trim()
  if (!src) return false
  const lang = guessLanguage(src)
  if (lang && lang !== 'markdown') return true
  if (OTHER_CODE_RE.test(src)) return true
  const symbols = (src.match(/[{}()[\];=<>]/g) ?? []).length / src.length
  return (src.includes('\n') && /^[ \t]{2,}\S/m.test(src) && symbols > 0.02) || symbols > 0.08
}
