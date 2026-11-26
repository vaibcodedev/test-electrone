import type { WebContents } from 'electron'
import type { TextMenuApi } from '@shared/api'
import {
  textMenuEditSchema,
  textMenuIdSchema,
  textMenuReplaceSchema
} from '@shared/domain/text-menu'
import { log } from '../core/logger'
import { UserError } from '../core/util'
import { isAppPageUrl } from '../ipc/rpc'
import { commandAllowed, menuRequest, type MenuGrant } from './text-menu-request'

/** A menu left open longer than this is stale: its command is refused. */
const MAX_AGE_MS = 10 * 60_000

const STALE = 'Меню застаріло — відкрийте його ще раз'

/**
 * Vault's right-click menu for text (features/text-menu in the renderer). Chromium's `context-menu` event says
 * that a menu is wanted and what it may offer; the renderer draws it, and the command comes back here and is
 * performed on that window's webContents — the same editing commands as the keys, so undo and the clipboard
 * work as usual. Only the latest menu can be acted on, once, and only with what it offered: a renderer can't
 * paste or replace words on its own.
 */
export class TextMenuController {
  private seq = 0
  private pending: (MenuGrant & { id: number; contents: WebContents; at: number }) | null = null

  attach(contents: WebContents): void {
    contents.on('context-menu', (_event, params) => {
      // The component preview is a sandboxed frame running the person's own code, a PDF has its viewer: our
      // menu lives in the app's document and can't hand focus back into another one. No menu there, as before.
      const frame = params.frame
      if (!frame || frame.parent || !isAppPageUrl(frame.url)) return
      const { request, grant } = menuRequest(params, ++this.seq, contents.getZoomFactor())
      this.pending = { ...grant, id: request.id, contents, at: Date.now() }
      contents.send('text-menu:open', request)
    })
  }

  /** The menu `id` if it is still the latest, unused and its window is alive; it is used up by this call. */
  private take(id: number): MenuGrant & { contents: WebContents } {
    const p = this.pending
    if (!p || p.id !== id || Date.now() - p.at > MAX_AGE_MS || p.contents.isDestroyed()) {
      log.warn('[text-menu] stale menu')
      throw new UserError(STALE)
    }
    this.pending = null
    return p
  }

  api(): TextMenuApi {
    return {
      edit: async (args) => {
        const { id, command } = textMenuEditSchema.parse(args)
        const menu = this.take(id)
        if (!commandAllowed(menu, command)) {
          log.warn(`[text-menu] refused ${command}`)
          throw new UserError('Ця дія зараз недоступна')
        }
        menu.contents[command]()
      },
      replaceMisspelling: async (args) => {
        const { id, word } = textMenuReplaceSchema.parse(args)
        const menu = this.take(id)
        if (!menu.suggestions.includes(word)) {
          log.warn('[text-menu] refused a replacement that was not offered')
          throw new UserError('Ця дія зараз недоступна')
        }
        menu.contents.replaceMisspelling(word)
      },
      addToDictionary: async (args) => {
        const { id } = textMenuIdSchema.parse(args)
        const menu = this.take(id)
        if (!menu.misspelledWord) throw new UserError('Ця дія зараз недоступна')
        if (!menu.contents.session.addWordToSpellCheckerDictionary(menu.misspelledWord)) {
          log.warn('[text-menu] the spellchecker did not take the word')
          throw new UserError('Не вдалося додати слово до словника')
        }
      }
    }
  }
}
