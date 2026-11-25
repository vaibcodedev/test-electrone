/** Manual order of rows (`position` column): the next free position and drag-and-drop reorder. */
import { and, eq, max, type SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { DbContext } from '../db/client'

/** Position after the last row matching `where` (0 for the first row). */
export function nextPosition(ctx: DbContext, column: SQLiteColumn, where?: SQL, step = 1): number {
  const last = ctx.orm.select({ m: max(column) }).from(column.table).where(where).get()
  return last?.m == null ? 0 : Number(last.m) + step
}

/**
 * Stores `ids` in the given order (position = index) in one transaction. `scope` keeps the update
 * inside the parent (a board's columns, a checklist's items), so foreign ids are ignored.
 */
export function reorder(
  ctx: DbContext,
  table: SQLiteTable & { position: SQLiteColumn },
  idColumn: SQLiteColumn,
  ids: string[],
  scope?: SQL
): void {
  ctx.tx(() => {
    ids.forEach((id, i) => {
      ctx.orm
        .update(table)
        .set({ position: i } as never)
        .where(and(eq(idColumn, id), scope))
        .run()
    })
  })
}
