import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

/** Markdown syntax nodes whose text is code: menus, list keys and link chips leave it alone. */
const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText'])

/**
 * Whether the text right after `pos` is code (a ``` block, an indented block or `inline code`), by the Markdown
 * syntax tree — an unclosed ``` already counts: everything under it is code while it is being typed.
 */
export function inCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1)
  for (;;) {
    if (CODE_NODES.has(node.name)) return true
    if (!node.parent) return false
    node = node.parent
  }
}
