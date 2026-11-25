/** Job-search fixtures shared by the unit tests (a vacancy with an interview in the calendar). */
import { eq } from 'drizzle-orm'
import { events } from '@main/db/schema'
import type { Vault } from './vault'

export const HOUR = 3600_000

export async function vacancyWithInterview(v: Vault): Promise<{ appId: string; stageId: string }> {
  const app = await v.api.jobs.create({ title: 'Frontend', companyName: 'Acme' })
  const stage = await v.api.jobs.addStage({ applicationId: app.id, kind: 'technical', at: Date.now() + 48 * HOUR })
  return { appId: app.id, stageId: stage.id }
}

export const stageEvents = (v: Vault, stageId: string): (typeof events.$inferSelect)[] =>
  v.db.orm.select().from(events).where(eq(events.sourceId, stageId)).all()
