import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { favoriteFilter, pageSchema } from '@shared/domain/common'
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
  type ChecklistKind,
  checklistImportSchema
} from '@shared/domain/checklists'
import { checklistItems, checklists } from '../db/schema'
import type { Orm } from '../db/client'
import { SoftRepository } from '../core/soft-repository'
import { seedOnce, type SeedLedger } from '../core/config-store'
import type { EntityDescriptor } from '../core/registry'
import { newId, now, NotFoundError, UserError } from '../core/util'
import { nextPosition, reorder } from '../core/ordering'
import { idArg, orderedIds, splitTags, updateArgs, type ModuleContext } from './context'
import { CHECKLIST_SEEDS } from './checklist-seeds'

type ChecklistRow = typeof checklists.$inferSelect

/** Items of a «Скасувати» snapshot (see restoreItems): the same limits as an edited item. */
const snapshotItemsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      text: checklistItemInputSchema.shape.text,
      hint: checklistItemInputSchema.shape.hint,
      section: checklistItemInputSchema.shape.section,
      position: z.number().finite(),
      done: z.boolean(),
      doneAt: z.number().int().nullable()
    })
  )
  .max(10_000)

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
      summary: (r) => ({ title: r.title, subtitle: r.kind === 'template' ? 'Шаблон' : 'Прогін' }),
      // Items are added, removed, renamed and moved in the «Редагувати» mode: «Скасувати» rolls them back too.
      children: {
        snapshot: (id) =>
          this.db
            .select({
              id: checklistItems.id,
              text: checklistItems.text,
              hint: checklistItems.hint,
              section: checklistItems.section,
              position: checklistItems.position,
              done: checklistItems.done,
              doneAt: checklistItems.doneAt
            })
            .from(checklistItems)
            .where(eq(checklistItems.checklistId, id))
            .orderBy(asc(checklistItems.position))
            .all(),
        restore: (id, snap) => this.restoreItems(id, snap),
        // A tick is work on the run, not an edit of the list.
        ignore: ['done', 'doneAt']
      },
      // An imported template or a run keeps the default title but has items: it is not an empty draft.
      draft: {
        titleField: 'title',
        contentFields: ['description'],
        hasChildren: (id) =>
          !!m.db.orm
            .select({ id: checklistItems.id })
            .from(checklistItems)
            .where(eq(checklistItems.checklistId, id))
            .limit(1)
            .get()
      }
    }
    this.repo = new SoftRepository(m.repo, this.descriptor, (r, tags) => ({
      ...r,
      kind: r.kind as ChecklistKind,
      tags,
      total: 0,
      done: 0
    }))
  }

  private get db(): Orm {
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
    return list.map((c) => ({
      ...c,
      total: byId.get(c.id)?.total ?? 0,
      done: byId.get(c.id)?.done ?? 0
    }))
  }

  private items(checklistId: string): ChecklistItem[] {
    return this.db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklistId))
      .orderBy(asc(checklistItems.position))
      .all()
  }

  /**
   * «Скасувати»: items back as in the snapshot (inside the revert transaction). Ticks of the items that stayed
   * are kept; a removed item comes back with its id and tick. The snapshot came from the renderer: checked.
   */
  private restoreItems(checklistId: string, snap: unknown): void {
    const parsed = snapshotItemsSchema.safeParse(snap)
    if (!parsed.success) throw new UserError('Знімок пунктів пошкоджено — зміни не скасовано')
    const wanted = new Map(parsed.data.map((i) => [i.id, i]))
    const current = new Set(this.items(checklistId).map((i) => i.id))
    const gone = [...current].filter((id) => !wanted.has(id))
    if (gone.length) this.db.delete(checklistItems).where(inArray(checklistItems.id, gone)).run()
    for (const item of wanted.values()) {
      const { id, text, hint, section, position } = item
      if (current.has(id)) {
        this.db
          .update(checklistItems)
          .set({ text, hint, section, position })
          .where(eq(checklistItems.id, id))
          .run()
        continue
      }
      // An id taken by another checklist's item is not ours to overwrite.
      const taken = this.db
        .select({ id: checklistItems.id })
        .from(checklistItems)
        .where(eq(checklistItems.id, id))
        .get()
      if (!taken)
        this.db
          .insert(checklistItems)
          .values({ ...item, checklistId })
          .run()
    }
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
  seedIfEmpty(ledger: SeedLedger): void {
    seedOnce(
      ledger,
      'checklists',
      () => !!this.db.select({ id: checklists.id }).from(checklists).limit(1).get(),
      () => this.seed()
    )
  }

  private seed(): void {
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
              .values({
                id: newId(),
                checklistId: list.id,
                text,
                hint,
                section: section.title,
                done: false,
                position: pos++
              })
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
          .object({
            kind: z.enum(CHECKLIST_KINDS).optional(),
            search: z.string().max(200).optional(),
            tagId: idArg.optional(),
            ...favoriteFilter
          })
          .extend(pageSchema.shape)
          .parse(args ?? {})
        return this.withCounts(
          repo.listFavoritesFirst(
            [
              q.kind ? eq(checklists.kind, q.kind) : undefined,
              repo.hasTag(q.tagId),
              repo.onlyFavorites(q.favorite),
              repo.matches(q.search, [checklists.title, checklists.description])
            ],
            undefined,
            q.limit,
            q.offset
          )
        )
      },
      counts: async () => {
        const rows = this.db
          .select({ kind: checklists.kind, n: count() })
          .from(checklists)
          .where(isNull(checklists.deletedAt))
          .groupBy(checklists.kind)
          .all()
        return {
          template: rows.find((r) => r.kind === 'template')?.n ?? 0,
          run: rows.find((r) => r.kind === 'run')?.n ?? 0
        }
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
        if (template.kind !== 'template') throw new UserError('Це не шаблон')
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
        // A project in the trash gets no link (links.create refuses one): the run itself is already made.
        if (data.projectId && this.m.registry.findRow({ type: 'project', id: data.projectId })) {
          this.m.links.create({
            fromType: 'checklist',
            fromId: run.id,
            toType: 'project',
            toId: data.projectId
          })
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
      importTemplate: async (json) => {
        const data = checklistImportSchema.parse(json)
        const created = this.m.db.tx(() => {
          const c = repo.insert({
            title: data.title,
            description: data.description,
            kind: 'template',
            templateId: null,
            projectId: null
          })
          let position = 1
          for (const section of data.sections) {
            for (const raw of section.items) {
              const it = typeof raw === 'string' ? { text: raw, hint: '' } : raw
              this.db
                .insert(checklistItems)
                .values({
                  id: newId(),
                  checklistId: c.id,
                  text: it.text,
                  hint: it.hint,
                  section: section.title,
                  done: false,
                  doneAt: null,
                  position: position++
                })
                .run()
            }
          }
          return c
        })
        this.reindex(created.id)
        return this.one(created.id)
      },
      addItem: async (input) => {
        const data = checklistItemInputSchema.parse(input)
        repo.rowOrThrow(data.checklistId)
        const item = {
          ...data,
          id: newId(),
          done: false,
          doneAt: null,
          position: nextPosition(
            this.m.db,
            checklistItems.position,
            eq(checklistItems.checklistId, data.checklistId)
          )
        }
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
        const item = this.db
          .update(checklistItems)
          .set(values)
          .where(eq(checklistItems.id, id))
          .returning()
          .get()
        if (!item) throw new NotFoundError('Пункт', id)
        if (patch.text !== undefined) this.reindex(item.checklistId)
        else repo.touch(item.checklistId)
        return item
      },
      removeItem: async (id) => {
        const item = this.db
          .select()
          .from(checklistItems)
          .where(eq(checklistItems.id, idArg.parse(id)))
          .get()
        if (!item) return
        this.db.delete(checklistItems).where(eq(checklistItems.id, item.id)).run()
        this.reindex(item.checklistId)
      },
      reorderItems: async (args) => {
        const { checklistId, ids } = z.object({ checklistId: idArg, ids: orderedIds }).parse(args)
        reorder(
          this.m.db,
          checklistItems,
          checklistItems.id,
          ids,
          eq(checklistItems.checklistId, checklistId)
        )
      }
    }
  }

  /** Count of checklist items completed per day (for the dashboard activity strip). */
  doneSince(from: number): { doneAt: number }[] {
    return (
      this.db
        .select({ doneAt: checklistItems.doneAt })
        .from(checklistItems)
        // Ticks of a checklist in the trash don't count as done work.
        .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
        .where(and(isNull(checklists.deletedAt), sql`${checklistItems.doneAt} >= ${from}`))
        .all() as { doneAt: number }[]
    )
  }
}
