import type { Design, DesignKind } from '@shared/domain/designs'
import { designTitleOf } from '@shared/design-title'
import { fmtBytes, plural } from '@/lib/format'

export const KIND_LABEL: Record<DesignKind, string> = {
  site: 'Сайт',
  landing: 'Лендинг',
  shop: 'Магазин',
  app: 'Застосунок',
  dashboard: 'Дашборд',
  other: 'Інше'
}

/**
 * «JPG · 1440 × 900 · 1,2 МБ»: the file's format (from its extension), pixel size and weight, each when known;
 * '' without a file.
 */
export const designFileMeta = (
  d: Pick<Design, 'imagePath' | 'imageWidth' | 'imageHeight' | 'imageBytes'>
): string => {
  if (!d.imagePath) return ''
  const ext = d.imagePath.split('.').pop()?.toLowerCase() ?? ''
  const format = ext === 'jpeg' ? 'JPG' : ext.toUpperCase()
  const size = d.imageWidth && d.imageHeight ? `${d.imageWidth} × ${d.imageHeight}` : ''
  const weight = d.imageBytes ? fmtBytes(d.imageBytes) : ''
  return [format, size, weight].filter(Boolean).join(' · ')
}

/** «3 дизайни»: the board tile and the «Додано …» toast. */
export const designCount = (n: number): string =>
  `${n} ${plural(n, ['дизайн', 'дизайни', 'дизайнів'])}`

/** Own title, the site (a link without a scheme too) or «Знімок 24 листопада о 19:22» — as main's summary. */
export const designTitle = (d: Pick<Design, 'title' | 'sourceUrl' | 'createdAt'>): string =>
  designTitleOf(d)
