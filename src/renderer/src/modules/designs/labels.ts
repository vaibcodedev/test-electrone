import type { Design, DesignKind } from '@shared/domain/designs'
import { designTitleOf } from '@shared/design-title'
import { plural } from '@/lib/format'

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

/** Own title, the site (a link without a scheme too) or «Знімок 24 листопада о 19:22» — as main's summary. */
export const designTitle = (d: Pick<Design, 'title' | 'sourceUrl' | 'createdAt'>): string =>
  designTitleOf(d)
