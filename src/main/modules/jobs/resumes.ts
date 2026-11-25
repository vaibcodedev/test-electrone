import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { JobsApi } from '@shared/api'
import { fileSourceSchema } from '@shared/domain/designs'
import { resumeInputSchema, resumePatchSchema, type Resume } from '@shared/domain/jobs'
import { applications, resumeBoards, resumes } from '../../db/schema'
import type { Orm } from '../../db/client'
import { newId, now, NotFoundError, pct } from '../../core/util'
import { idArg, updateArgs, type ModuleContext } from '../context'

type ResumesApi = Pick<
  JobsApi,
  'resumes' | 'createResume' | 'updateResume' | 'replaceResumeFile' | 'removeResume' | 'setResumeUploaded'
>

/** Resume versions (file + where it's uploaded) with the reply rate of the applications sent with each. */
export class Resumes {
  constructor(private readonly m: ModuleContext) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  list(): Resume[] {
    const rows = this.db.select().from(resumes).orderBy(desc(resumes.createdAt)).all()
    const uploads = this.db.select().from(resumeBoards).all()
    const stats = this.db
      .select({
        resumeId: applications.resumeId,
        sent: sql<number>`count(*)`,
        replied: sql<number>`sum(CASE WHEN ${applications.repliedAt} IS NOT NULL THEN 1 ELSE 0 END)`
      })
      .from(applications)
      .where(
        and(
          isNull(applications.deletedAt),
          isNotNull(applications.resumeId),
          sql`${applications.status} != 'saved'`
        )
      )
      .groupBy(applications.resumeId)
      .all()
    return rows.map((r) => {
      const s = stats.find((x) => x.resumeId === r.id)
      return {
        ...r,
        boards: uploads
          .filter((u) => u.resumeId === r.id)
          .map((u) => ({ boardId: u.boardId, uploadedAt: u.uploadedAt })),
        sent: s?.sent ?? 0,
        replied: s?.replied ?? 0,
        replyRate: pct(s?.replied ?? 0, s?.sent ?? 0)
      }
    })
  }

  api(): ResumesApi {
    return {
      resumes: async () => this.list(),
      createResume: async (args) => {
        const { input, source } = z
          .object({ input: resumeInputSchema, source: fileSourceSchema.optional() })
          .parse(args)
        const stored = source ? await this.m.files.import(source) : null
        const ts = now()
        const id = newId()
        this.m.db.tx(() => {
          if (input.isCurrent) this.db.update(resumes).set({ isCurrent: false }).run()
          this.db
            .insert(resumes)
            .values({
              ...input,
              id,
              filePath: stored?.path ?? null,
              fileName: stored?.originalName ?? '',
              mime: stored?.mime ?? '',
              size: stored?.size ?? 0,
              createdAt: ts,
              updatedAt: ts
            })
            .run()
        })
        return this.list().find((r) => r.id === id)!
      },
      updateResume: async (args) => {
        const { id, patch } = updateArgs(resumePatchSchema).parse(args)
        this.m.db.tx(() => {
          if (patch.isCurrent) this.db.update(resumes).set({ isCurrent: false }).run()
          this.db
            .update(resumes)
            .set({ ...patch, updatedAt: now() })
            .where(eq(resumes.id, id))
            .run()
        })
        const r = this.list().find((x) => x.id === id)
        if (!r) throw new NotFoundError('Резюме', id)
        return r
      },
      replaceResumeFile: async (args) => {
        const { id, source } = z.object({ id: idArg, source: fileSourceSchema }).parse(args)
        const cur = this.db.select().from(resumes).where(eq(resumes.id, id)).get()
        if (!cur) throw new NotFoundError('Резюме', id)
        const stored = await this.m.files.import(source)
        this.db
          .update(resumes)
          .set({
            filePath: stored.path,
            fileName: stored.originalName,
            mime: stored.mime,
            size: stored.size,
            updatedAt: now()
          })
          .where(eq(resumes.id, id))
          .run()
        this.m.files.remove(cur.filePath)
        return this.list().find((r) => r.id === id)!
      },
      removeResume: async (id) => {
        const cur = this.db
          .select()
          .from(resumes)
          .where(eq(resumes.id, idArg.parse(id)))
          .get()
        if (!cur) return
        this.db.delete(resumeBoards).where(eq(resumeBoards.resumeId, cur.id)).run()
        this.db.delete(resumes).where(eq(resumes.id, cur.id)).run()
        this.m.files.remove(cur.filePath)
      },
      setResumeUploaded: async (args) => {
        const { resumeId, boardId, uploaded } = z
          .object({ resumeId: idArg, boardId: idArg, uploaded: z.boolean() })
          .parse(args)
        this.db
          .delete(resumeBoards)
          .where(and(eq(resumeBoards.resumeId, resumeId), eq(resumeBoards.boardId, boardId)))
          .run()
        if (uploaded) this.db.insert(resumeBoards).values({ resumeId, boardId, uploadedAt: now() }).run()
      }
    }
  }
}
