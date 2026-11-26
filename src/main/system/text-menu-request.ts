/** Pure part of the text menu in main (no Electron imports — covered by unit tests). */
import type { ContextMenuParams } from 'electron'
import {
  MAX_SUGGESTIONS,
  type TextEditCommand,
  type TextMenuRequest
} from '@shared/domain/text-menu'

export type MenuParams = Pick<
  ContextMenuParams,
  | 'x'
  | 'y'
  | 'isEditable'
  | 'selectionText'
  | 'linkURL'
  | 'misspelledWord'
  | 'dictionarySuggestions'
  | 'formControlType'
  | 'menuSourceType'
  | 'editFlags'
>

/** What a command may do, remembered in main for the one menu it was opened for. */
export interface MenuGrant {
  can: TextMenuRequest['can']
  misspelledWord: string | null
  suggestions: string[]
}

const LINK = /^(https?|mailto):/i

/**
 * Chromium's menu parameters → what the renderer's menu needs. The selected text never leaves main (only
 * «there is some»); a password field never offers cut or copy, even if a renderer claims it could.
 */
export function menuRequest(
  params: MenuParams,
  id: number,
  zoom: number
): { request: TextMenuRequest; grant: MenuGrant } {
  const password = params.formControlType === 'input-password'
  const flags = params.editFlags
  const can = {
    cut: !password && params.isEditable && flags.canCut,
    copy: !password && flags.canCopy,
    paste: params.isEditable && flags.canPaste,
    selectAll: flags.canSelectAll
  }
  const misspelledWord =
    params.isEditable && !password && params.misspelledWord ? params.misspelledWord : null
  const suggestions = misspelledWord
    ? params.dictionarySuggestions.filter((w) => w.length > 0 && w.length <= 100).slice(0, MAX_SUGGESTIONS)
    : []
  const link = LINK.test(params.linkURL) && params.linkURL.length <= 4096 ? params.linkURL : null
  const scale = zoom > 0 ? zoom : 1
  return {
    request: {
      id,
      x: Math.round(params.x / scale),
      y: Math.round(params.y / scale),
      keyboard: params.menuSourceType === 'keyboard',
      editable: params.isEditable,
      hasSelection: params.selectionText.length > 0,
      link,
      can,
      spelling: misspelledWord ? { suggestions } : null
    },
    grant: { can, misspelledWord, suggestions }
  }
}

/** The menu offered this command. */
export function commandAllowed(grant: MenuGrant, command: TextEditCommand): boolean {
  switch (command) {
    case 'cut':
      return grant.can.cut
    case 'copy':
      return grant.can.copy
    case 'paste':
    case 'pasteAndMatchStyle':
      return grant.can.paste
    case 'selectAll':
      return grant.can.selectAll
  }
}
