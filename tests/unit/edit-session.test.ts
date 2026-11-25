/**
 * «Зберегти» of a record in edit mode (lib/edit-session.ts): off until something changed, off while a field shows
 * an error or an inline form is open, and the server — not typing — decides whether the record still differs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EditSession,
  FIX_ERRORS,
  NO_CHANGES,
  editSignal,
  hasUnsaved,
  saveBlockOf,
  type EditSessionDeps
} from '@/lib/edit-session'

interface Setup {
  session: EditSession
  state: { pending: boolean; server: boolean | null }
  deps: EditSessionDeps
  seen: number[]
}

function setup(
  overrides: Partial<EditSessionDeps> = {},
  check?: () => Promise<boolean | null>
): Setup {
  const state = { pending: false, server: false as boolean | null }
  const deps: EditSessionDeps = {
    pending: () => state.pending,
    settled: () => Promise.resolve(),
    onValid: vi.fn(),
    delay: 10,
    ...overrides
  }
  const session = new EditSession(deps)
  session.setCheck(check ?? (() => Promise.resolve(state.server)))
  const seen: number[] = []
  session.subscribe(() => seen.push(1))
  return { session, state, deps, seen }
}

/** Past the debounce and the awaited checks. */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(20)
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('saveBlockOf', () => {
  it('says why «Зберегти» is off, errors first', () => {
    const idle = { changed: false, invalid: false, form: null }
    expect(saveBlockOf(idle)).toBe(NO_CHANGES)
    expect(saveBlockOf({ ...idle, changed: true })).toBeUndefined()
    expect(saveBlockOf({ ...idle, changed: true, invalid: true })).toBe(FIX_ERRORS)
    expect(saveBlockOf({ ...idle, changed: true, form: 'етап' })).toBe(
      'Спершу додайте або скасуйте етап'
    )
    expect(saveBlockOf({ ...idle, form: '' })).toBe('Спершу додайте або скасуйте відкриту форму')
    expect(saveBlockOf({ ...idle, invalid: true, form: 'етап' })).toBe(FIX_ERRORS)
  })

  it('a record created a moment ago has something to save, unless a field is wrong', () => {
    const idle = { changed: false, invalid: false, form: null }
    expect(saveBlockOf(idle, true)).toBeUndefined()
    expect(saveBlockOf({ ...idle, invalid: true }, true)).toBe(FIX_ERRORS)
  })

  it('an error or an open form is unsaved too: leaving asks', () => {
    const idle = { changed: false, invalid: false, form: null }
    expect(hasUnsaved(idle)).toBe(false)
    expect(hasUnsaved({ ...idle, invalid: true })).toBe(true)
    expect(hasUnsaved({ ...idle, form: 'етап' })).toBe(true)
  })
})

describe('EditSession', () => {
  it('starts with nothing to save; typing turns it on at once', () => {
    const { session } = setup()
    session.start()
    expect(session.getView()).toEqual({ changed: false, invalid: false, form: null })
    session.edited()
    expect(session.getView().changed).toBe(true)
    session.stop()
  })

  it('the server decides after the save: a word typed and erased leaves nothing to save', async () => {
    const { session, state } = setup()
    session.start()
    session.edited()
    state.server = false
    session.saved()
    await settle()
    expect(session.getView().changed).toBe(false)
    session.stop()
  })

  it('an immediate patch (a status Select, a tag) turns it on through the server check', async () => {
    const { session, state } = setup()
    session.start()
    state.server = true
    session.saved()
    await settle()
    expect(session.getView().changed).toBe(true)
    session.stop()
  })

  it('waits while an autosave still holds a value', async () => {
    const { session, state } = setup()
    session.start()
    session.edited()
    state.pending = true
    state.server = false
    session.saved()
    await settle()
    expect(session.getView().changed).toBe(true)
    session.stop()
  })

  it('a server answer older than the last keystroke is ignored', async () => {
    let answer: (v: boolean) => void = () => undefined
    const { session } = setup({}, () => new Promise<boolean>((resolve) => (answer = resolve)))
    session.start()
    session.saved()
    await vi.advanceTimersByTimeAsync(15)
    session.edited() // typed while the check was on its way
    answer(false)
    await settle()
    expect(session.getView().changed).toBe(true)
    session.stop()
  })

  it('without a snapshot (null) typing alone decides', async () => {
    const { session, state } = setup()
    state.server = null
    session.start()
    session.edited()
    session.saved()
    await settle()
    expect(session.getView().changed).toBe(true)
    session.stop()
  })

  it('a field with an error holds «Зберегти» and the autosaves until it is released', () => {
    const { session, deps } = setup()
    session.start()
    expect(editSignal.held()).toBe(false)
    const a = session.holdInvalid()
    const b = session.holdInvalid()
    expect(session.getView().invalid).toBe(true)
    expect(editSignal.held()).toBe(true)
    a()
    a() // a second release changes nothing
    expect(session.getView().invalid).toBe(true)
    expect(deps.onValid).not.toHaveBeenCalled()
    b()
    expect(session.getView().invalid).toBe(false)
    expect(editSignal.held()).toBe(false)
    // The last error is gone: what the autosaves held back goes out.
    expect(deps.onValid).toHaveBeenCalledTimes(1)
    session.stop()
  })

  it('an open inline form names itself in the reason', () => {
    const { session } = setup()
    session.start()
    const release = session.holdOpen('етап')
    expect(session.getView().form).toBe('етап')
    expect(saveBlockOf(session.getView())).toBe('Спершу додайте або скасуйте етап')
    release()
    expect(session.getView().form).toBeNull()
    session.stop()
  })

  it('an error found before the session started (a child watcher runs first) is kept', () => {
    const { session } = setup()
    session.holdInvalid()
    session.start()
    expect(session.getView().invalid).toBe(true)
    session.stop()
    expect(session.getView().invalid).toBe(false)
  })

  it('stopping forgets everything and lets the autosaves go', () => {
    const { session } = setup()
    session.start()
    session.edited()
    session.holdInvalid()
    session.holdOpen('доступ')
    session.stop()
    expect(session.getView()).toEqual({ changed: false, invalid: false, form: null })
    expect(editSignal.held()).toBe(false)
    // Signals after the end change nothing.
    session.edited()
    expect(session.getView().changed).toBe(false)
  })

  it('signals reach every session being edited, and only those', () => {
    const one = setup().session
    const two = setup().session
    one.start()
    editSignal.edited()
    expect(one.getView().changed).toBe(true)
    expect(two.getView().changed).toBe(false)
    one.stop()
  })

  it('tells its listeners only when something the button shows changed', () => {
    const { session, seen } = setup()
    session.start()
    const before = seen.length
    session.edited()
    session.edited()
    session.edited()
    expect(seen.length).toBe(before + 1)
    session.stop()
  })
})
