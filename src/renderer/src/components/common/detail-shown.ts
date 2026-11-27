import { createContext } from 'react'

/**
 * True while MasterDetail has its record pane on screen, the exit animation included. A list that lays itself out
 * differently beside a record reads this, not `?open=`: the URL changes at once, the pane goes 0.16 s later, and a
 * grid following the URL re-laid its cards twice.
 */
export const DetailShownContext = createContext(false)
