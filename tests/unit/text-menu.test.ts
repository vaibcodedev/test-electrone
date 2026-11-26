import { describe, expect, it } from 'vitest'
import type { TextMenuRequest } from '@shared/domain/text-menu'
import { commandAllowed, menuRequest, type MenuParams } from '@main/system/text-menu-request'
import { shortcutLabel, textMenuGroups } from '@/features/text-menu/model'

const FLAGS = {
  canUndo: false,
  canRedo: false,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: false
}

function params(over: Partial<MenuParams> = {}): MenuParams {
  return {
    x: 100,
    y: 50,
    isEditable: true,
    selectionText: 'секрет',
    linkURL: '',
    misspelledWord: '',
    dictionarySuggestions: [],
    formControlType: 'text-area',
    menuSourceType: 'mouse',
    editFlags: FLAGS,
    ...over
  }
}

const req = (over: Partial<TextMenuRequest> = {}): TextMenuRequest => ({
  id: 1,
  x: 0,
  y: 0,
  keyboard: false,
  editable: false,
  hasSelection: false,
  link: null,
  can: { cut: false, copy: false, paste: false, selectAll: true },
  spelling: null,
  ...over
})

const labels = (groups: ReturnType<typeof textMenuGroups>): string[][] =>
  groups.map((g) => g.map((e) => (e.disabled ? `(${e.label})` : e.label)))

const place = { codeBlock: false, mac: false }

describe('menuRequest (main)', () => {
  it('never sends the selected text, only that there is some', () => {
    const { request } = menuRequest(params(), 7, 1)
    expect(request.hasSelection).toBe(true)
    expect(JSON.stringify(request)).not.toContain('секрет')
    expect(request.id).toBe(7)
  })

  it('a password field offers neither cut nor copy, whatever the renderer says', () => {
    const { request, grant } = menuRequest(params({ formControlType: 'input-password' }), 1, 1)
    expect(request.can).toEqual({ cut: false, copy: false, paste: true, selectAll: true })
    expect(commandAllowed(grant, 'copy')).toBe(false)
    expect(commandAllowed(grant, 'cut')).toBe(false)
    expect(commandAllowed(grant, 'paste')).toBe(true)
  })

  it('outside a field nothing can be cut or pasted', () => {
    const { grant } = menuRequest(params({ isEditable: false }), 1, 1)
    expect(commandAllowed(grant, 'cut')).toBe(false)
    expect(commandAllowed(grant, 'pasteAndMatchStyle')).toBe(false)
    expect(commandAllowed(grant, 'copy')).toBe(true)
  })

  it('keeps only http(s) and mailto links', () => {
    expect(menuRequest(params({ linkURL: 'https://example.com/a' }), 1, 1).request.link).toBe(
      'https://example.com/a'
    )
    expect(menuRequest(params({ linkURL: 'mailto:a@b.c' }), 1, 1).request.link).toBe('mailto:a@b.c')
    for (const linkURL of ['javascript:alert(1)', 'file:///C:/x', 'vault:note/1', 'app://renderer/x'])
      expect(menuRequest(params({ linkURL }), 1, 1).request.link).toBeNull()
  })

  it('spelling: only in an editable field, at most 6 replacements', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const { request, grant } = menuRequest(
      params({ misspelledWord: 'тест', dictionarySuggestions: many }),
      1,
      1
    )
    expect(request.spelling?.suggestions).toEqual(many.slice(0, 6))
    expect(grant.misspelledWord).toBe('тест')
    expect(
      menuRequest(params({ isEditable: false, misspelledWord: 'тест' }), 1, 1).request.spelling
    ).toBeNull()
  })

  it('converts the position to CSS pixels and tells a keyboard menu apart', () => {
    const { request } = menuRequest(params({ menuSourceType: 'keyboard' }), 1, 1.25)
    expect(request).toMatchObject({ x: 80, y: 40, keyboard: true })
  })
})

describe('textMenuGroups (renderer)', () => {
  it('a field: all editing rows always, the unavailable ones disabled', () => {
    const groups = textMenuGroups(
      req({ editable: true, can: { cut: false, copy: false, paste: true, selectAll: true } }),
      place
    )
    expect(labels(groups)).toEqual([
      ['(Вирізати)', '(Копіювати)', 'Вставити', 'Вставити без форматування'],
      ['Виділити все']
    ])
    expect(groups[0].map((e) => e.shortcut)).toEqual(['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+Shift+V'])
  })

  it('a misspelled word: replacements and «Додати в словник» first', () => {
    const groups = textMenuGroups(
      req({ editable: true, spelling: { suggestions: ['тест', 'текст'] } }),
      place
    )
    expect(labels(groups)[0]).toEqual(['тест', 'текст', 'Додати в словник'])
    expect(groups[0][0]).toMatchObject({ suggestion: true, action: { kind: 'replace', word: 'тест' } })
    const none = textMenuGroups(req({ editable: true, spelling: { suggestions: [] } }), place)
    expect(labels(none)[0]).toEqual(['(Варіантів немає)', 'Додати в словник'])
  })

  it('outside a field: nothing selected, no link, no code — no menu', () => {
    expect(textMenuGroups(req(), place)).toEqual([])
  })

  it('selected text: «Копіювати»; a link adds open and copy address', () => {
    const selected = req({ hasSelection: true, can: { cut: false, copy: true, paste: false, selectAll: true } })
    expect(labels(textMenuGroups(selected, place))).toEqual([['Копіювати']])
    expect(labels(textMenuGroups({ ...selected, link: 'https://x.dev' }, place))).toEqual([
      ['Відкрити в браузері', 'Копіювати адресу'],
      ['Копіювати']
    ])
  })

  it('a code block: «Копіювати весь блок», «Копіювати» only with a selection', () => {
    expect(labels(textMenuGroups(req(), { ...place, codeBlock: true }))).toEqual([
      ['(Копіювати)', 'Копіювати весь блок']
    ])
  })

  it('shows the keys of the system', () => {
    expect(shortcutLabel('pasteAndMatchStyle', true)).toBe('⌘⇧V')
    expect(shortcutLabel('selectAll', false)).toBe('Ctrl+A')
  })
})
