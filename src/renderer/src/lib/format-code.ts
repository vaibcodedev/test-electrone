import type { Plugin } from 'prettier'
import type { CodeLanguage } from '@/components/common/code'

type Parser = 'typescript' | 'babel' | 'json' | 'css' | 'html' | 'markdown' | 'graphql'

const PARSER: Partial<Record<CodeLanguage, Parser>> = {
  typescript: 'typescript',
  tsx: 'typescript',
  javascript: 'babel',
  jsx: 'babel',
  json: 'json',
  css: 'css',
  html: 'html',
  liquid: 'html',
  markdown: 'markdown',
  graphql: 'graphql'
}

export function canFormat(language: CodeLanguage): boolean {
  return language in PARSER
}

/** Only the plugins a parser needs, loaded on demand: Prettier is a separate chunk, startup is unaffected. */
async function pluginsFor(parser: Parser): Promise<Plugin[]> {
  const mods: Promise<unknown>[] = []
  switch (parser) {
    case 'typescript':
      mods.push(import('prettier/plugins/typescript'), import('prettier/plugins/estree'))
      break
    case 'babel':
    case 'json':
      mods.push(import('prettier/plugins/babel'), import('prettier/plugins/estree'))
      break
    case 'css':
      mods.push(import('prettier/plugins/postcss'))
      break
    case 'html':
      // html embeds <style>/<script>: give it css and js printers too.
      mods.push(
        import('prettier/plugins/html'),
        import('prettier/plugins/postcss'),
        import('prettier/plugins/babel'),
        import('prettier/plugins/estree')
      )
      break
    case 'markdown':
      mods.push(import('prettier/plugins/markdown'))
      break
    case 'graphql':
      mods.push(import('prettier/plugins/graphql'))
      break
  }
  return (await Promise.all(mods)) as Plugin[]
}

/**
 * Formats code with Prettier (standalone build: no eval, fine under the strict CSP).
 * Style matches the project: single quotes, no semicolons; width — what the editor shows. Throws on parse errors.
 */
export async function formatCode(code: string, language: CodeLanguage, printWidth = 100): Promise<string> {
  const parser = PARSER[language]
  if (!parser) throw new Error('Форматування недоступне для цієї мови')
  const [{ format }, plugins] = await Promise.all([import('prettier/standalone'), pluginsFor(parser)])
  return format(code, { parser, plugins, printWidth, singleQuote: true, semi: false })
}
