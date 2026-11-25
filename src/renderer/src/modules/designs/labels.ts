import type { Design, DesignKind } from '@shared/domain/designs'
import { hostOf, plural } from '@/lib/format'
import { normalizeUrl } from '@/lib/open-url'

export const KIND_LABEL: Record<DesignKind, string> = {
  site: 'Сайт',
  landing: 'Лендинг',
  shop: 'Магазин',
  app: 'Застосунок',
  dashboard: 'Дашборд',
  other: 'Інше'
}

/** «3 дизайни»: the board tile and the «Додано …» toast. */
export const designCount = (n: number): string =>
  `${n} ${plural(n, ['дизайн', 'дизайни', 'дизайнів'])}`

export function designTitle(d: Pick<Design, 'title' | 'sourceUrl'>): string {
  // A link saved without a scheme still names the design by its site.
  return d.title || (d.sourceUrl ? hostOf(normalizeUrl(d.sourceUrl)) : '') || 'Без назви'
}
