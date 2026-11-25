import type { KeyboardEvent } from 'react'

interface ClickableProps {
  role: 'button'
  tabIndex: number
  onClick: () => void
  onKeyDown: (e: KeyboardEvent) => void
}

/**
 * A non-button element that acts as one (a card, a row with buttons inside): Enter and Space activate it.
 * Keys pressed on a nested control are left to that control — Enter on «Прибрати зв’язок» inside a row
 * used to bubble up and open the row as well.
 */
export function clickableProps(onActivate: () => void): ClickableProps {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    }
  }
}
