/** Dialogs open clean (freshOnOpen, useResetOnOpen): a new session on every opening, none on closing. */
import { describe, expect, it } from 'vitest'
import { nextOpenSession, type OpenSession } from '@/hooks/use-open-session'

describe('nextOpenSession', () => {
  it('counts openings, not closings', () => {
    let s: OpenSession = { open: false, count: 0 }
    s = nextOpenSession(s, true)
    expect(s).toEqual({ open: true, count: 1 })
    s = nextOpenSession(s, false)
    expect(s).toEqual({ open: false, count: 1 })
    s = nextOpenSession(s, true)
    expect(s).toEqual({ open: true, count: 2 })
  })

  it('returns the same object while nothing changes, so a render-time update stops', () => {
    const open: OpenSession = { open: true, count: 3 }
    expect(nextOpenSession(open, true)).toBe(open)
    const closed: OpenSession = { open: false, count: 3 }
    expect(nextOpenSession(closed, false)).toBe(closed)
  })
})
