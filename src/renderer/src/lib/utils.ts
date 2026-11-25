import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Custom theme values from globals.css, so tailwind-merge knows their groups:
 * - type roles (`--text-*`): without them `text-body` would be merged as a colour;
 * - animations (`--animate-*`) and the easing (`--ease-soft`): unknown, `cn('animate-pane', 'animate-leave')`
 *   kept both and the earlier one in the CSS won (the record pane never faded out).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'meta',
        'caption',
        'body',
        'lead',
        'heading',
        'stat-sm',
        'headline',
        'stat',
        'title',
        'display'
      ],
      animate: ['enter', 'page', 'pane', 'pane-out', 'leave', 'trash-bump'],
      ease: ['soft']
    },
    // `truncate` in a className beats the base's line-clamp/text-balance (ItemDescription): text-balance kept
    // wrapping on, and the «cut» meta line broke onto a second line.
    conflictingClassGroups: { 'text-overflow': ['line-clamp', 'text-wrap'] }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
