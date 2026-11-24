/** Visual modules: UI components (code + live preview + cover) and design references with moodboards. */
import { and, asc, eq, inArray, isNull, max } from 'drizzle-orm'
import { z } from 'zod'
import type { ComponentsApi, DesignsApi, MoodboardsApi } from '@shared/api'
import {
  componentInputSchema,
  componentListQuerySchema,
  componentPatchSchema,
  type ComponentInput,
  type ComponentLanguage,
  type ComponentListQuery,
  type ComponentPatch,
  type PreviewBackground,
  type UiComponent
} from '@shared/domain/components'
import {
  designInputSchema,
  designListQuerySchema,
  designPatchSchema,
  fileSourceSchema,
  moodboardInputSchema,
  moodboardPatchSchema,
  type Design,
  type DesignKind,
  type Moodboard,
  type MoodboardInput,
  type MoodboardPatch
} from '@shared/domain/designs'
import { designs, moodboardItems, moodboards, uiComponents } from '../db/schema'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { idArg, splitTags, updateArgs, type ModuleContext } from './context'
import { createCrudApi } from './crud'
import { hostOf } from './knowledge'

type ComponentRow = typeof uiComponents.$inferSelect
type DesignRow = typeof designs.$inferSelect
type MoodboardRow = typeof moodboards.$inferSelect

const DESIGN_KIND_LABEL: Record<DesignKind, string> = {
  site: 'Сайт',
  landing: 'Лендинг',
  shop: 'Магазин',
  app: 'Приложение',
  dashboard: 'Дашборд',
  other: 'Другое'
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Perceptual-ish distance; ~60 means "same color family". */
function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const rm = (r1 + r2) / 2
  return Math.sqrt(
    (2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2
  )
}

export class MediaModule {
  readonly descriptors: EntityDescriptor[]
  readonly componentRepo: SoftRepository<ComponentRow, UiComponent>
  readonly designRepo: SoftRepository<DesignRow, Design>
  readonly moodboardRepo: SoftRepository<MoodboardRow, Omit<Moodboard, 'itemCount' | 'previewPaths'>>

  constructor(private readonly m: ModuleContext) {
    const component: EntityDescriptor = {
      type: 'component',
      table: uiComponents,
      searchDoc: (r) => ({ title: r.title, body: `${r.description}\n${r.code}` }),
      summary: (r) => ({ title: r.title, subtitle: r.language.toUpperCase() }),
      onPurge: (r) => m.files.remove(r.coverPath)
    }
    const design: EntityDescriptor = {
      type: 'design',
      table: designs,
      searchDoc: (r) => ({
        title: r.title || hostOf(r.sourceUrl) || 'Дизайн',
        body: `${r.notes}\n${r.sourceUrl}\n${DESIGN_KIND_LABEL[r.kind as DesignKind]}`
      }),
      summary: (r) => ({
        title: r.title || hostOf(r.sourceUrl) || 'Без названия',
        subtitle: DESIGN_KIND_LABEL[r.kind as DesignKind]
      }),
      onPurge: (r) => m.files.remove(r.imagePath)
    }
    const moodboard: EntityDescriptor = {
      type: 'moodboard',
      table: moodboards,
      searchDoc: (r) => ({ title: r.title, body: r.description }),
      summary: (r) => ({ title: r.title, subtitle: 'Подборка' })
    }
    this.descriptors = [component, design, moodboard]
    this.componentRepo = new SoftRepository(m.repo, component, (r, tags) => ({
      ...r,
      language: r.language as ComponentLanguage,
      previewBg: r.previewBg as PreviewBackground,
      tags
    }))
    this.designRepo = new SoftRepository(m.repo, design, (r, tags) => ({ ...r, kind: r.kind as DesignKind, tags }))
    this.moodboardRepo = new SoftRepository(m.repo, moodboard, (r, tags) => ({ ...r, tags }))
  }

  private get db() {
    return this.m.db.orm
  }

  /* ───────── components ───────── */

  componentsApi(): ComponentsApi {
    const repo = this.componentRepo
    return {
      ...createCrudApi<ComponentRow, UiComponent, ComponentInput, ComponentPatch, ComponentListQuery>({
        repo,
        input: componentInputSchema,
        patch: componentPatchSchema,
        query: componentListQuerySchema,
        where: (q) => [
          repo.hasTag(q.tagId),
          repo.matches(q.search, [uiComponents.title, uiComponents.description, uiComponents.code])
        ]
      }),
      setCover: async (args) => {
        const { id, source } = z.object({ id: idArg, source: fileSourceSchema }).parse(args)
        const current = repo.rowOrThrow(id)
        const stored = await this.m.files.import(source, { imagesOnly: true })
        const updated = repo.patch(id, { coverPath: stored.path })
        this.m.files.remove(current.coverPath)
        return updated
      },
      removeCover: async (id) => {
        const current = repo.rowOrThrow(idArg.parse(id))
        const updated = repo.patch(current.id, { coverPath: null })
        this.m.files.remove(current.coverPath)
        return updated
      }
    }
  }

  /* ───────── designs ───────── */

  designsApi(): DesignsApi {
    const repo = this.designRepo
    return {
      list: async (query) => {
        const q = designListQuerySchema.parse(query ?? {})
        const inBoard = q.moodboardId
          ? inArray(
              designs.id,
              this.db
                .select({ id: moodboardItems.designId })
                .from(moodboardItems)
                .where(eq(moodboardItems.moodboardId, q.moodboardId))
            )
          : undefined
        let list = repo.listWhere([
          q.kind ? eq(designs.kind, q.kind) : undefined,
          inBoard,
          repo.hasTag(q.tagId),
          repo.matches(q.search, [designs.title, designs.notes, designs.sourceUrl])
        ])
        if (q.color) {
          const target = q.color
          list = list.filter((d) => d.colors.some((c) => colorDistance(c, target) < 90))
        }
        return list
      },
      get: async (id) => repo.get(idArg.parse(id)),
      create: async (input) => {
        const [data, tagIds] = splitTags(designInputSchema.parse(input))
        return repo.insert({ ...data, imagePath: null, imageWidth: null, imageHeight: null }, tagIds)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(designPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return repo.patch(id, data, tagIds)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      importImage: async (args) => {
        const { source, input } = z
          .object({ source: fileSourceSchema, input: designInputSchema.optional() })
          .parse(args)
        const stored = await this.m.files.import(source, { imagesOnly: true })
        const [data, tagIds] = splitTags(input ?? designInputSchema.parse({}))
        const title = data.title || stored.originalName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
        return repo.insert(
          {
            ...data,
            title: title === 'clipboard' ? '' : title,
            imagePath: stored.path,
            imageWidth: stored.width,
            imageHeight: stored.height
          },
          tagIds
        )
      },
      replaceImage: async (args) => {
        const { id, source } = z.object({ id: idArg, source: fileSourceSchema }).parse(args)
        const current = repo.rowOrThrow(id)
        const stored = await this.m.files.import(source, { imagesOnly: true })
        const updated = repo.patch(id, {
          imagePath: stored.path,
          imageWidth: stored.width,
          imageHeight: stored.height,
          colors: []
        })
        this.m.files.remove(current.imagePath)
        return updated
      },
      palette: async () => {
        const rows = this.db.select({ colors: designs.colors }).from(designs).where(isNull(designs.deletedAt)).all()
        const counts = new Map<string, number>()
        for (const r of rows) for (const c of r.colors) counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1)
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([c]) => c)
      }
    }
  }

  /* ───────── moodboards ───────── */

  private moodboardSummaries(ids?: string[]): Moodboard[] {
    const list = this.moodboardRepo.listWhere(ids ? [inArray(moodboards.id, ids)] : [])
    if (!list.length) return []
    const items = this.db
      .select({ moodboardId: moodboardItems.moodboardId, path: designs.imagePath })
      .from(moodboardItems)
      .innerJoin(designs, eq(designs.id, moodboardItems.designId))
      .where(
        and(
          isNull(designs.deletedAt),
          inArray(
            moodboardItems.moodboardId,
            list.map((b) => b.id)
          )
        )
      )
      .orderBy(asc(moodboardItems.position))
      .all()
    return list.map((b) => {
      const mine = items.filter((i) => i.moodboardId === b.id)
      return {
        ...b,
        itemCount: mine.length,
        previewPaths: mine.map((i) => i.path).filter((p): p is string => !!p).slice(0, 4)
      }
    })
  }

  moodboardsApi(): MoodboardsApi {
    const repo = this.moodboardRepo
    const one = (id: string): Moodboard => {
      const found = this.moodboardSummaries([id])[0]
      if (!found) throw new Error('Подборка не найдена')
      return found
    }
    return {
      list: async () => this.moodboardSummaries(),
      get: async (id) => this.moodboardSummaries([idArg.parse(id)])[0] ?? null,
      create: async (input: MoodboardInput) => {
        const [data, tagIds] = splitTags(moodboardInputSchema.parse(input))
        return one(repo.insert(data, tagIds).id)
      },
      update: async (args: { id: string; patch: MoodboardPatch }) => {
        const { id, patch } = updateArgs(moodboardPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        repo.patch(id, data, tagIds)
        return one(id)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      details: async (id) => {
        const board = this.moodboardSummaries([idArg.parse(id)])[0]
        if (!board) return null
        const rows = this.db
          .select({ id: moodboardItems.designId })
          .from(moodboardItems)
          .where(eq(moodboardItems.moodboardId, board.id))
          .orderBy(asc(moodboardItems.position))
          .all()
        const list = this.designRepo.listWhere([
          inArray(
            designs.id,
            rows.map((r) => r.id)
          )
        ])
        const byId = new Map(list.map((d) => [d.id, d]))
        return { ...board, designs: rows.flatMap((r) => byId.get(r.id) ?? []) }
      },
      addDesigns: async (args) => {
        const { moodboardId, designIds } = z.object({ moodboardId: idArg, designIds: z.array(idArg) }).parse(args)
        repo.rowOrThrow(moodboardId)
        const last = this.db
          .select({ m: max(moodboardItems.position) })
          .from(moodboardItems)
          .where(eq(moodboardItems.moodboardId, moodboardId))
          .get()
        let pos = last?.m ?? 0
        this.m.db.tx(() => {
          for (const designId of designIds) {
            this.db
              .insert(moodboardItems)
              .values({ moodboardId, designId, position: ++pos })
              .onConflictDoNothing()
              .run()
          }
        })
        repo.touch(moodboardId)
      },
      removeDesign: async (args) => {
        const { moodboardId, designId } = z.object({ moodboardId: idArg, designId: idArg }).parse(args)
        this.db
          .delete(moodboardItems)
          .where(and(eq(moodboardItems.moodboardId, moodboardId), eq(moodboardItems.designId, designId)))
          .run()
        repo.touch(moodboardId)
      },
      reorder: async (args) => {
        const { moodboardId, designIds } = z.object({ moodboardId: idArg, designIds: z.array(idArg) }).parse(args)
        this.m.db.tx(() => {
          designIds.forEach((designId, i) => {
            this.db
              .update(moodboardItems)
              .set({ position: i })
              .where(and(eq(moodboardItems.moodboardId, moodboardId), eq(moodboardItems.designId, designId)))
              .run()
          })
        })
      }
    }
  }
}

