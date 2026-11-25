import { fmtDateTime } from './dates'
import { hostOf } from './url'

/**
 * Name of a design wherever it shows (gallery tile, Ctrl+K, «Обране», links, trash): its own title, else the
 * site it came from, else when it was taken — «Знімок 24 листопада о 19:22» (a screenshot pasted from the
 * clipboard has no name of its own). Display only: the search index keeps the stored title.
 */
export function designTitleOf(d: { title: string; sourceUrl: string; createdAt: number }): string {
  return d.title.trim() || hostOf(d.sourceUrl) || `Знімок ${fmtDateTime(d.createdAt)}`
}
