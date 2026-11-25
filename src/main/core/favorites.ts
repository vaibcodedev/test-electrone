import { and, eq, exists, sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { EntityType } from '@shared/entity-types'
import type { Orm } from '../db/client'
import { pins } from '../db/schema'

/**
 * Condition «the row is in Обране»: a correlated EXISTS over `pins` (drizzle «select parent rows with at least
 * one related child row»). Drizzle qualifies columns as "table"."col", so `id` stays bound to the outer row;
 * all three PK columns are equalities — one probe of the PK index per row.
 */
export function favoriteExists(orm: Orm, type: EntityType, id: SQLiteColumn): SQL {
  return exists(
    orm
      .select({ one: sql`1` })
      .from(pins)
      .where(and(eq(pins.entityType, type), eq(pins.entityId, id), eq(pins.kind, 'favorite')))
  )
}
