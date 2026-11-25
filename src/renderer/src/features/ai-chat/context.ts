import type { EntityRef } from '@shared/domain/common'
import { ENTITY_META, ENTITY_TYPES, type EntityType } from '@shared/entity-types'

/**
 * Where each type's record lives in the URL, read from ENTITY_META routes (the same ones search and links open):
 * `/ideas?open=<id>` → a query parameter on a page, `/clients/<id>` → a path segment.
 */
const MARK = '\u0000'
const ROUTES = ENTITY_TYPES.map((type) => {
  const [path, query = ''] = ENTITY_META[type].route(MARK).split('?')
  const param = new URLSearchParams(query)
  const key = [...param.keys()].find((k) => param.get(k) === MARK) ?? null
  const segments = path.split('/')
  return { type, path, key, idAt: key ? -1 : segments.indexOf(MARK), segments }
})

/**
 * The record open on the page, from the URL: the record pane (`?open=`) first, then a record page (`/clients/…`).
 * A board card opens as a sheet over its board (`/boards/<id>?card=<cardId>`). Null on a list, the dashboard…
 */
export function recordFromLocation(pathname: string, search: string): EntityRef | null {
  const params = new URLSearchParams(search)
  const card = params.get('card')
  if (card && /^\/boards\/[^/]+$/.test(pathname)) return { type: 'card', id: card }
  for (const r of ROUTES) {
    if (!r.key || r.path !== pathname) continue
    const id = params.get(r.key)
    if (id) return { type: r.type, id }
  }
  const parts = pathname.split('/')
  for (const r of ROUTES) {
    if (r.key || r.idAt < 0 || r.segments.length !== parts.length) continue
    if (r.segments.every((s, i) => i === r.idAt || s === parts[i]) && parts[r.idAt])
      return { type: r.type as EntityType, id: decodeURIComponent(parts[r.idAt]) }
  }
  return null
}
