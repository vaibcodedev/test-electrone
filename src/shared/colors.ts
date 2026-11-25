/**
 * The one colour palette for things the user colours (tags, events, job boards) and for the calendar feed.
 * Shared by main (seeds, feed items) and renderer (swatches), so a seeded colour is always a known swatch.
 */
export const PALETTE = ['#d4f542', '#7c8cf8', '#f5a524', '#f06b6b', '#3fbf9b', '#c98af0', '#5aa9f0', '#9a9f93'] as const

export type PaletteColor = (typeof PALETTE)[number]

/** One spoken name per swatch (screen readers, tooltips): a hex code says nothing. */
export const COLOR_NAME: Record<PaletteColor, string> = {
  '#d4f542': 'Лаймовий',
  '#7c8cf8': 'Синій',
  '#f5a524': 'Помаранчевий',
  '#f06b6b': 'Червоний',
  '#3fbf9b': 'Бірюзовий',
  '#c98af0': 'Бузковий',
  '#5aa9f0': 'Блакитний',
  '#9a9f93': 'Сірий'
}
