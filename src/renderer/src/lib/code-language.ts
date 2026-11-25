import hljs from 'highlight.js/lib/common'

/** Language ids used across modules (snippets, components, markdown fences). */
export type CodeLanguage =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'graphql'
  | 'liquid'
  | 'css'
  | 'html'
  | 'json'
  | 'bash'
  | 'sql'
  | 'markdown'
  | 'text'

// `export` counts as shell only as `export VAR=…`: `export { … }` / `export const` is JavaScript.
const SHELL_RE = /^(\$ |#!\/|(sudo|npm|npx|pnpm|yarn|bun|git|cd|ls|mkdir|rm|cp|mv|curl|wget|docker|kubectl|echo|brew|pip|apt|chmod)\s|export\s+[A-Z_][A-Z0-9_]*=)/m
/** Unmistakable JS/TS statements; checked before shell/SQL, whose keywords can also start a line of code. */
const JS_RE = /^\s*(import\s[^;]*\sfrom\s|import\s+['"]|export\s+(default|const|let|var|function|class|type|interface|async|\{|\*)|(const|let|var)\s+[\w{[]|(async\s+)?function\s*\w*\s*\(|class\s+\w+)/m
/** TypeScript-only syntax: interfaces, type aliases, annotations, `as const`, generic calls. */
const TS_RE = /\binterface\s+\w+|\btype\s+\w+\s*=|:\s*(string|number|boolean|void|unknown|any|React\.\w+|[A-Z]\w*(<[^>]*>)?)(\[\])?\s*[,)=;{}|<>]|:\s*\{\s*\w+\??:\s*\w|\w\?:\s|\bas\s+const\b|\w<[A-Z]\w*(\[\])?>\(/
const SQL_RE = /^\s*(select\s.+\sfrom\s|insert\s+into\s|update\s+\w+\s+set\s|delete\s+from\s|create\s+(table|index|view)\s|alter\s+table\s|with\s+\w+\s+as\s*\()/im
const MD_RE = /^(#{1,6}\s+\S|[-*+]\s+\S|\d+\.\s+\S|>\s|```)/m
const GRAPHQL_RE = /^\s*(query|mutation|subscription|fragment)\b[^{]*\{/m

/** highlight.js names → our CodeLanguage (only languages the app supports). */
const FROM_HLJS: Record<string, CodeLanguage> = {
  typescript: 'typescript',
  javascript: 'javascript',
  css: 'css',
  scss: 'css',
  xml: 'html',
  json: 'json',
  bash: 'bash',
  shell: 'bash',
  sql: 'sql',
  markdown: 'markdown',
  graphql: 'graphql'
}

/**
 * Guesses the language of pasted code. Cheap heuristics first, then highlight.js auto-detection
 * over our languages only. Returns null when unsure — the UI suggests a switch, never forces it.
 */
export function detectLanguage(code: string): CodeLanguage | null {
  const src = code.trim()
  if (src.length < 2) return null
  if (/^[[{]/.test(src)) {
    try {
      JSON.parse(src)
      return 'json'
    } catch {
      /* not JSON: an object literal or a block, keep guessing */
    }
  }
  if (/^\{%|\{\{[^}]+\}\}/.test(src) && /\{%\s*(if|for|assign|render|schema)\b/.test(src)) return 'liquid'
  if (/^</.test(src)) {
    // Braces inside <style>/<script> are CSS/JS, not JSX expressions.
    const markup = src.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    if (/^<!doctype|^<html|^<(div|section|span|p|ul|head|body|meta|link|script|style)[\s>]/i.test(src) && !/\bclassName=|\{[^}]*\}/.test(markup)) return 'html'
    return 'tsx'
  }
  // Markdown with fenced code: the fence content would otherwise look like JS/bash line by line.
  if (/^```/m.test(src)) return 'markdown'
  if (JS_RE.test(src)) {
    const jsx = /\breturn\s*\(?\s*<|<[A-Z][\w.]*[\s/>]|<\/\w+>/.test(src)
    const ts = TS_RE.test(src)
    return jsx ? (ts ? 'tsx' : 'jsx') : ts ? 'typescript' : 'javascript'
  }
  if (GRAPHQL_RE.test(src)) return 'graphql'
  if (SQL_RE.test(src)) return 'sql'
  if (SHELL_RE.test(src)) return 'bash'
  if (/\breturn\s*\(?\s*</.test(src) || /<[A-Z]\w*[\s/>]/.test(src)) return /:\s*\w+(\[\])?\s*[,)=]|interface\s|type\s+\w+\s*=/.test(src) ? 'tsx' : 'jsx'
  if (MD_RE.test(src) && !/[;{}]\s*$/m.test(src)) return 'markdown'
  try {
    const res = hljs.highlightAuto(src, Object.keys(FROM_HLJS))
    if (res.language && res.relevance >= 6) return FROM_HLJS[res.language] ?? null
  } catch {
    /* fall through */
  }
  return null
}

/** Human label for a suggestion like «Схоже на JSON». */
export const LANGUAGE_LABEL: Record<CodeLanguage, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  tsx: 'TSX',
  jsx: 'JSX',
  graphql: 'GraphQL',
  liquid: 'Liquid',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  bash: 'Bash',
  sql: 'SQL',
  markdown: 'Markdown',
  text: 'Текст'
}
