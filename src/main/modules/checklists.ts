import { and, asc, eq, inArray, max, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ChecklistsApi } from '@shared/api'
import {
  CHECKLIST_KINDS,
  checklistInputSchema,
  checklistItemInputSchema,
  checklistItemPatchSchema,
  checklistPatchSchema,
  instantiateSchema,
  type Checklist,
  type ChecklistItem,
  type ChecklistKind
} from '@shared/domain/checklists'
import { checklistItems, checklists } from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { newId, now, NotFoundError, UserError } from '../core/util'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'
import { CHECKLIST_SEEDS } from './checklist-seeds'

type ChecklistRow = typeof checklists.$inferSelect

export class ChecklistsModule {
  readonly descriptor: EntityDescriptor
  readonly repo: SoftRepository<ChecklistRow, Checklist>

  constructor(private readonly m: ModuleContext) {
    this.descriptor = {
      type: 'checklist',
      table: checklists,
      searchDoc: (r) => {
        const items = m.db.orm
          .select({ text: checklistItems.text })
          .from(checklistItems)
          .where(eq(checklistItems.checklistId, r.id))
          .all()
        return { title: r.title, body: `${r.description}\n${items.map((i) => i.text).join('\n')}` }
      },
      summary: (r) => ({ title: r.title, subtitle: r.kind === 'template' ? 'Шаблон' : 'Прогон' })
    }
    this.repo = new SoftRepository(m.repo, this.descriptor, (r, tags) => ({
      ...r,
      kind: r.kind as ChecklistKind,
      tags,
      total: 0,
      done: 0
    }))
  }

  private get db() {
    return this.m.db.orm
  }

  private withCounts(list: Checklist[]): Checklist[] {
    if (!list.length) return list
    const counts = this.db
      .select({
        id: checklistItems.checklistId,
        total: sql<number>`count(*)`,
        done: sql<number>`sum(${checklistItems.done})`
      })
      .from(checklistItems)
      .where(
        inArray(
          checklistItems.checklistId,
          list.map((c) => c.id)
        )
      )
      .groupBy(checklistItems.checklistId)
      .all()
    const byId = new Map(counts.map((c) => [c.id, c]))
    return list.map((c) => ({ ...c, total: byId.get(c.id)?.total ?? 0, done: byId.get(c.id)?.done ?? 0 }))
  }

  private items(checklistId: string): ChecklistItem[] {
    return this.db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklistId))
      .orderBy(asc(checklistItems.position))
      .all()
  }

  private one(id: string): Checklist {
    return this.withCounts([this.repo.getOrThrow(id)])[0]
  }

  private reindex(id: string): void {
    const row = this.repo.row(id)
    if (row) {
      this.m.repo.search.indexRow('checklist', row)
      this.repo.touch(id)
    }
  }

  /** Creates the built-in templates once, on an empty database. */
  seedIfEmpty(): void {
    const any = this.db.select({ id: checklists.id }).from(checklists).limit(1).get()
    if (any) return
    this.m.db.tx(() => {
      for (const seed of CHECKLIST_SEEDS) {
        const list = this.repo.insert({
          title: seed.title,
          description: seed.description,
          kind: 'template',
          templateId: null,
          projectId: null
        })
        let pos = 0
        for (const section of seed.sections) {
          for (const item of section.items) {
            const [text, hint = ''] = Array.isArray(item) ? item : [item]
            this.db
              .insert(checklistItems)
              .values({ id: newId(), checklistId: list.id, text, hint, section: section.title, done: false, position: pos++ })
              .run()
          }
        }
        this.reindex(list.id)
      }
    })
  }

  api(): ChecklistsApi {
    const repo = this.repo
    return {
      list: async (args) => {
        const q = z
          .object({ kind: z.enum(CHECKLIST_KINDS).optional(), search: z.string().max(200).optional(), tagId: idArg.optional() })
          .parse(args ?? {})
        return this.withCounts(
          repo.listWhere([
            q.kind ? eq(checklists.kind, q.kind) : undefined,
            repo.hasTag(q.tagId),
            repo.matches(q.search, [checklists.title, checklists.description])
          ])
        )
      },
      get: async (id) => {
        const c = repo.get(idArg.parse(id))
        if (!c) return null
        return { ...this.withCounts([c])[0], items: this.items(c.id) }
      },
      create: async (input) => {
        const [data, tagIds] = splitTags(checklistInputSchema.parse(input))
        return this.one(repo.insert({ ...data, templateId: null }, tagIds).id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(checklistPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        repo.patch(id, data, tagIds)
        return this.one(id)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      instantiate: async (input) => {
        const data = instantiateSchema.parse(input)
        const template = repo.rowOrThrow(data.templateId)
        if (template.kind !== 'template') throw new UserError('Это не шаблон')
        const tags = this.m.repo.tags.forMany('checklist', [template.id]).get(template.id) ?? []
        const run = this.m.db.tx(() => {
          const created = repo.insert(
            {
              title: data.title,
              description: template.description,
              kind: 'run',
              templateId: template.id,
              projectId: data.projectId
            },
            tags.map((t) => t.id)
          )
          for (const item of this.items(template.id)) {
            this.db
              .insert(checklistItems)
              .values({ ...item, id: newId(), checklistId: created.id, done: false, doneAt: null })
              .run()
          }
          return created
        })
        if (data.projectId) {
          this.m.links.create({ fromType: 'checklist', fromId: run.id, toType: 'project', toId: data.projectId })
        }
        this.reindex(run.id)
        return this.one(run.id)
      },
      reset: async (id) => {
        this.db
          .update(checklistItems)
          .set({ done: false, doneAt: null })
          .where(eq(checklistItems.checklistId, idArg.parse(id)))
          .run()
        repo.touch(id)
      },
      addItem: async (input) => {
        const data = checklistItemInputSchema.parse(input)
        repo.rowOrThrow(data.checklistId)
        const last = this.db
          .select({ m: max(checklistItems.position) })
          .from(checklistItems)
          .where(eq(checklistItems.checklistId, data.checklistId))
          .get()
        const item = { ...data, id: newId(), done: false, doneAt: null, position: (last?.m ?? 0) + 1 }
        this.db.insert(checklistItems).values(item).run()
        this.reindex(data.checklistId)
        return item
      },
      updateItem: async (args) => {
        const { id, patch } = updateArgs(checklistItemPatchSchema).parse(args)
        const values = {
          ...patch,
          ...(patch.done !== undefined ? { doneAt: patch.done ? now() : null } : {})
        }
        const item = this.db.update(checklistItems).set(values).where(eq(checklistItems.id, id)).returning().get()
        if (!item) throw new NotFoundError('Пункт', id)
        if (patch.text !== undefined) this.reindex(item.checklistId)
        else repo.touch(item.checklistId)
        return item
      },
      removeItem: async (id) => {
        const item = this.db.select().from(checklistItems).where(eq(checklistItems.id, idArg.parse(id))).get()
        if (!item) return
        this.db.delete(checklistItems).where(eq(checklistItems.id, item.id)).run()
        this.reindex(item.checklistId)
      },
      reorderItems: async (args) => {
        const { checklistId, ids } = z.object({ checklistId: idArg, ids: z.array(idArg) }).parse(args)
        this.m.db.tx(() => {
          ids.forEach((id, i) => {
            this.db
              .update(checklistItems)
              .set({ position: i })
              .where(and(eq(checklistItems.id, id), eq(checklistItems.checklistId, checklistId)))
              .run()
          })
        })
      }
    }
  }

  /** Count of checklist items completed per day (for the dashboard activity strip). */
  doneSince(from: number): { doneAt: number }[] {
    return this.db
      .select({ doneAt: checklistItems.doneAt })
      .from(checklistItems)
      .where(sql`${checklistItems.doneAt} >= ${from}`)
      .all() as { doneAt: number }[]
  }
}
