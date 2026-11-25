/**
 * What stands behind «Зберегти» of a record being edited (useRecordMode): is there anything to save, and may it be
 * saved now. Pure — no React, no IPC: the hook gives it the checks, the fields and autosaves give it signals.
 *
 * «Something to save» has three sources, and one mechanism covers them all without per-module code:
 * - typing: every autosave field reports the keystroke (`editSignal.edited`), so the button wakes up at once;
 * - anything that reached main — an autosave, an immediate patch (status Select, a tag), a child row: every settled
 *   mutation (`editSignal.saved`) makes the session ask the server whether the record still differs from the snapshot
 *   taken on «Редагувати» (`records.changed`). The server is the judge, so typing a word and deleting it again, or a
 *   pin toggled meanwhile, leaves «Зберегти» off;
 * - an open inline form and a field with an error count as unsaved too (they are held by `holdOpen` / `holdInvalid`).
 */

export const NO_CHANGES = 'Змін немає'
export const FIX_ERRORS = 'Виправте поля з помилками'

/** A field that shows an error: the control (`aria-invalid`) or its shadcn Field (`data-invalid`). */
export const INVALID_FIELD = '[aria-invalid="true"], [data-invalid="true"]'

export interface EditView {
  /** The record differs from the snapshot, or a field holds a value that hasn't reached main yet. */
  changed: boolean
  /** A field of the record shows an error. */
  invalid: boolean
  /** An inline form is open: its name («етап») or '' when it has none; null — no form is open. */
  form: string | null
}

/**
 * Why «Зберегти» is unavailable right now, or undefined when it may be pressed. A record created a moment ago always
 * has something to save (keeping it is the change); errors come first — they are what the person can fix.
 */
export function saveBlockOf(view: EditView, fresh = false): string | undefined {
  if (view.invalid) return FIX_ERRORS
  if (view.form !== null) return `Спершу додайте або скасуйте ${view.form || 'відкриту форму'}`
  if (!fresh && !view.changed) return NO_CHANGES
  return undefined
}

/** Leaving would lose something: asks «Зберегти зміни?» instead of just closing. */
export const hasUnsaved = (view: EditView): boolean =>
  view.changed || view.invalid || view.form !== null

export interface EditSessionDeps {
  /** An autosave field holds a value that hasn't gone out yet (typing, or held back by an error). */
  pending: () => boolean
  /** Resolves once no mutation is running. */
  settled: () => Promise<void>
  /** The last error is fixed: send what the autosaves held back meanwhile. */
  onValid?: () => void
  /** Pause before asking the server: a burst of saves is one question. */
  delay?: number
}

const IDLE: EditView = { changed: false, invalid: false, form: null }

export class EditSession {
  private readonly invalid = new Set<symbol>()
  private readonly forms = new Map<symbol, string | undefined>()
  private changed = false
  private active = false
  /** Bumped by every edit: a server answer that started before it is stale. */
  private seq = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<() => void>()
  private view: EditView = IDLE
  /** Does the record differ from the snapshot? null — can't tell (no type, no snapshot, the call failed). */
  private changedOnServer: () => Promise<boolean | null> = () => Promise.resolve(null)

  constructor(private readonly deps: EditSessionDeps) {}

  /** The server check of this record (set by the hook once it knows the record and its snapshot). */
  setCheck(check: () => Promise<boolean | null>): void {
    this.changedOnServer = check
  }

  /** useSyncExternalStore: the view object changes only when something the button shows changes. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  readonly getView = (): EditView => this.view

  get isActive(): boolean {
    return this.active
  }

  /**
   * «Редагувати»: a new transaction, nothing changed yet. Errors and forms registered a moment earlier stay: the
   * fields' watchers (child effects) run before the editor's own effect starts the session.
   */
  start(): void {
    this.forget()
    this.active = true
    sessions.add(this)
    this.publish()
  }

  /** Edit mode is over (saved, cancelled, unmounted): forget everything, let autosaves go. */
  stop(): void {
    this.forget()
    this.invalid.clear()
    this.forms.clear()
    this.active = false
    sessions.delete(this)
    this.publish()
  }

  /** Typed into a field: there is something to save at once; the server check follows the save. */
  edited(): void {
    if (!this.active) return
    this.seq++
    this.changed = true
    this.publish()
    this.schedule()
  }

  /** Something reached main (or a pending value was dropped): ask the server again once things settle. */
  saved(): void {
    if (this.active) this.schedule()
  }

  /** A field shows an error: «Зберегти» is off and no autosave goes out until it is released. */
  readonly holdInvalid = (): (() => void) => {
    const key = Symbol()
    this.invalid.add(key)
    this.publish()
    return () => {
      if (!this.invalid.delete(key)) return
      this.publish()
      // The error is gone: values typed meanwhile (held back) go out now.
      if (!this.invalid.size) this.deps.onValid?.()
    }
  }

  /** An inline form is open («+ Етап»): «Зберегти» waits until it is added or cancelled. */
  readonly holdOpen = (what?: string): (() => void) => {
    const key = Symbol()
    this.forms.set(key, what)
    this.publish()
    return () => {
      if (this.forms.delete(key)) this.publish()
    }
  }

  get hasInvalid(): boolean {
    return this.invalid.size > 0
  }

  private forget(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.seq++
    this.changed = false
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.verify(), this.deps.delay ?? 150)
  }

  private async verify(): Promise<void> {
    this.timer = null
    // A value still waiting to be saved is a change; its own save signals again.
    if (this.deps.pending()) return
    const run = this.seq
    await this.deps.settled()
    if (run !== this.seq || !this.active) return
    const changed = await this.changedOnServer()
    if (run !== this.seq || !this.active || changed === null) return
    if (changed !== this.changed) {
      this.changed = changed
      this.publish()
    }
  }

  private publish(): void {
    const form = this.forms.size ? ([...this.forms.values()].find(Boolean) ?? '') : null
    const next: EditView = this.active
      ? { changed: this.changed, invalid: this.invalid.size > 0, form }
      : IDLE
    const prev = this.view
    if (prev.changed === next.changed && prev.invalid === next.invalid && prev.form === next.form)
      return
    this.view = next
    for (const l of this.listeners) l()
  }
}

/** Records being edited right now (usually one; a card sheet over a board in edit mode makes two). */
const sessions = new Set<EditSession>()

/**
 * The channel between autosave fields / mutations and the sessions. Autosaves live above the record's mode
 * provider (the editor calls useAutosave, then renders DetailPane), so they can't reach a session through context:
 * they signal every session, and each one checks its own record on the server.
 */
export const editSignal = {
  /** A field got a new value (typing). */
  edited(): void {
    for (const s of sessions) s.edited()
  },
  /** A save reached main, or an autosave flushed / skipped its value. */
  saved(): void {
    for (const s of sessions) s.saved()
  },
  /** A record being edited shows an error: autosaves keep their values instead of sending them. */
  held(): boolean {
    for (const s of sessions) if (s.hasInvalid) return true
    return false
  }
}
