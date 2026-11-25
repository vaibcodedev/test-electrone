import { pageSchema } from '@shared/domain/common'
/** Visual modules: UI components (code + live preview + cover) and design references with moodboards. */
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
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
  designColorsSchema,
  designCountsQuerySchema,
  designInputSchema,
  designListQuerySchema,
  designPatchSchema,
  fileSourceSchema,
  moodboardInputSchema,
  moodboardListQuerySchema,
  moodboardPatchSchema,
  type Design,
  type DesignCountsQuery,
  type DesignKind,
  type Moodboard,
  type MoodboardInput,
  type MoodboardListQuery,
  type MoodboardPatch
} from '@shared/domain/designs'
import { designs, moodboardItems, moodboards, pins, uiComponents } from '../db/schema'
import type { Orm } from '../db/client'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { NotFoundError } from '../core/util'
import { nextPosition, reorder } from '../core/ordering'
import { idArg, orderedIds, splitTags, updateArgs, type ModuleContext } from './context'
import { createCrudApi } from './crud'
import { hostOf } from '@shared/url'
import { designTitleOf } from '@shared/design-title'

type ComponentRow = typeof uiComponents.$inferSelect
type DesignRow = typeof designs.$inferSelect
type MoodboardRow = typeof moodboards.$inferSelect

const DESIGN_KIND_LABEL: Record<DesignKind, string> = {
  site: 'Сайт',
  landing: 'Лендинг',
  shop: 'Магазин',
  app: 'Застосунок',
  dashboard: 'Дашборд',
  other: 'Інше'
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
  readonly moodboardRepo: SoftRepository<
    MoodboardRow,
    Omit<Moodboard, 'itemCount' | 'previewPaths' | 'favorite'>
  >

  /**
   * Designs imported before their file size was stored get it from the disk once, at start: a cheap stat per
   * row, only for rows without it, so later starts do nothing. A missing file stays null (the tile omits it).
   */
  backfillImageBytes(): number {
    const rows = this.db
      .select({ id: designs.id, imagePath: designs.imagePath })
      .from(designs)
      .where(and(isNull(designs.imageBytes), sql`${designs.imagePath} IS NOT NULL`))
      .all()
    let filled = 0
    for (const r of rows) {
      const bytes = this.m.files.sizeOf(r.imagePath)
      if (bytes === null) continue
      this.db.update(designs).set({ imageBytes: bytes }).where(eq(designs.id, r.id)).run()
      filled++
    }
    return filled
  }

  constructor(private readonly m: ModuleContext) {
    const component: EntityDescriptor = {
      type: 'component',
      table: uiComponents,
      searchDoc: (r) => ({ title: r.title, body: `${r.description}\n${r.code}` }),
      summary: (r) => ({ title: r.title, subtitle: r.language.toUpperCase() }),
      draft: {
        titleField: 'title',
        contentFields: ['description', 'sourceUrl', 'coverPath', 'code']
      },
      onPurge: (r) => m.files.remove(r.coverPath),
      fileFields: { coverPath: [] }
    }
    const design: EntityDescriptor = {
      type: 'design',
      table: designs,
      searchDoc: (r) => ({
        title: r.title || hostOf(r.sourceUrl) || 'Дизайн',
        body: `${r.notes}\n${r.sourceUrl}\n${DESIGN_KIND_LABEL[r.kind as DesignKind]}`
      }),
      // The same name as the gallery tile: own title, the site, or «Знімок 24 листопада о 19:22».
      summary: (r) => ({
        title: designTitleOf(r as DesignRow),
        subtitle: DESIGN_KIND_LABEL[r.kind as DesignKind]
      }),
      onPurge: (r) => m.files.remove(r.imagePath),
      fileFields: { imagePath: ['imageWidth', 'imageHeight', 'imageBytes', 'colors'] }
    }
    const moodboard: EntityDescriptor = {
      type: 'moodboard',
      table: moodboards,
      draft: { titleField: 'title', contentFields: ['description'] },
      searchDoc: (r) => ({ title: r.title, body: r.description }),
      summary: (r) => ({
        title: r.title,
        subtitle: r.description ? r.description.slice(0, 80) : undefined
      })
    }
    this.descriptors = [component, design, moodboard]
    this.componentRepo = new SoftRepository(m.repo, component, (r, tags) => ({
      ...r,
      language: r.language as ComponentLanguage,
      previewBg: r.previewBg as PreviewBackground,
      tags
    }))
    this.designRepo = new SoftRepository(m.repo, design, (r, tags) => ({
      ...r,
      kind: r.kind as DesignKind,
      tags
    }))
    this.moodboardRepo = new SoftRepository(m.repo, moodboard, (r, tags) => ({ ...r, tags }))
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  /* ───────── components ───────── */

  componentsApi(): ComponentsApi {
    const repo = this.componentRepo
    return {
      ...createCrudApi<
        ComponentRow,
        UiComponent,
        ComponentInput,
        ComponentPatch,
        ComponentListQuery
      >({
        repo,
        input: componentInputSchema,
        patch: componentPatchSchema,
        query: componentListQuerySchema,
        where: (q) => [
          repo.hasTag(q.tagId),
          repo.onlyFavorites(q.favorite),
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

  /** Connections that already have vault_color_near (the connection is replaced on backup restore). */
  private readonly colorFnOn = new WeakSet<object>()

  /** SQL function: 1 when any colour in the JSON array is within ~90 of the target (same colour family). */
  private ensureColorFn(): void {
    const db = this.m.db.sqlite
    if (this.colorFnOn.has(db)) return
    db.function('vault_color_near', { deterministic: true }, (json: unknown, target: unknown) => {
      if (typeof json !== 'string' || typeof target !== 'string') return 0
      try {
        const colors = JSON.parse(json) as unknown
        return Array.isArray(colors) &&
          colors.some((c) => typeof c === 'string' && colorDistance(c, target) < 90)
          ? 1
          : 0
      } catch {
        return 0
      }
    })
    this.colorFnOn.add(db)
  }

  /** Every design list filter except the kind: shared by `list` and the kind chip `counts`. */
  private designFilters(q: DesignCountsQuery): (SQL | undefined)[] {
    const repo = this.designRepo
    const inBoard = q.moodboardId
      ? inArray(
          designs.id,
          this.db
            .select({ id: moodboardItems.designId })
            .from(moodboardItems)
            .where(eq(moodboardItems.moodboardId, q.moodboardId))
        )
      : undefined
    // Colour match runs in SQL (registered function), so LIMIT/OFFSET page correctly.
    if (q.color) this.ensureColorFn()
    return [
      inBoard,
      repo.hasTag(q.tagId),
      repo.onlyFavorites(q.favorite),
      repo.matches(q.search, [designs.title, designs.notes, designs.sourceUrl]),
      q.color ? sql`vault_color_near(${designs.colors}, ${q.color}) = 1` : undefined
    ]
  }

  designsApi(): DesignsApi {
    const repo = this.designRepo
    return {
      list: async (query) => {
        const q = designListQuerySchema.parse(query ?? {})
        const page = pageSchema.parse(query ?? {})
        return repo.listFavoritesFirst(
          [q.kind ? eq(designs.kind, q.kind) : undefined, ...this.designFilters(q)],
          undefined,
          page.limit,
          page.offset
        )
      },
      counts: async (query) =>
        repo.countBy(designs.kind, this.designFilters(designCountsQuerySchema.parse(query ?? {}))),
      get: async (id) => repo.get(idArg.parse(id)),
      create: async (input) => {
        const [data, tagIds] = splitTags(designInputSchema.parse(input))
        return repo.insert(
          { ...data, imagePath: null, imageWidth: null, imageHeight: null, imageBytes: null },
          tagIds
        )
      },
      update: async (args) => {
        const { id, patch } = updateArgs(designPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        return repo.patch(id, data, tagIds)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      // Colours are not searchable: no reindex; no updatedAt, the record wasn't edited by the user.
      setColors: async (args) => {
        const { id, colors } = designColorsSchema.parse(args)
        repo.rowOrThrow(id)
        this.db.update(designs).set({ colors }).where(eq(designs.id, id)).run()
      },
      importImage: async (args) => {
        const { source, input } = z
          .object({ source: fileSourceSchema, input: designInputSchema.optional() })
          .parse(args)
        const stored = await this.m.files.import(source, { imagesOnly: true })
        const [data, tagIds] = splitTags(input ?? designInputSchema.parse({}))
        const title =
          data.title || stored.originalName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
        return repo.insert(
          {
            ...data,
            title: title === 'clipboard' ? '' : title,
            imagePath: stored.path,
            imageWidth: stored.width,
            imageHeight: stored.height,
            imageBytes: stored.size
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
          imageBytes: stored.size,
          colors: []
        })
        this.m.files.remove(current.imagePath)
        return updated
      },
      palette: async () => {
        const rows = this.db
          .select({ colors: designs.colors })
          .from(designs)
          .where(isNull(designs.deletedAt))
          .all()
        const counts = new Map<string, number>()
        for (const r of rows)
          for (const c of r.colors)
            counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1)
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 40)
          .map(([c]) => c)
      }
    }
  }

  /* ───────── moodboards ───────── */

  /** Search over the moodboard title and description (case-insensitive, Cyrillic too: ulower). */
  private moodboardWhere(search?: string): SQL | undefined {
    return this.moodboardRepo.matches(search, [moodboards.title, moodboards.description])
  }

  /**
   * Moodboards with their cover and counts. Order: favourites first, then boards holding live designs, then
   * empty ones; each group by last change. «Filled» follows the same rule as `itemCount` (designs in the trash
   * don't count), so a board whose designs all went to the trash sorts with the empty ones.
   */
  private moodboardSummaries(opts: MoodboardListQuery & { ids?: string[] } = {}): Moodboard[] {
    const filled = sql`exists (select 1 from ${moodboardItems} inner join ${designs} on ${designs.id} = ${moodboardItems.designId} where ${moodboardItems.moodboardId} = ${moodboards.id} and ${designs.deletedAt} is null)`
    const list = this.moodboardRepo.listWhere(
      [opts.ids ? inArray(moodboards.id, opts.ids) : undefined, this.moodboardWhere(opts.search)],
      [this.moodboardRepo.favoritesFirst(), desc(filled), desc(moodboards.updatedAt)],
      opts.limit,
      opts.offset
    )
    if (!list.length) return []
    const ids = list.map((b) => b.id)
    const favorites = new Set(
      this.db
        .select({ id: pins.entityId })
        .from(pins)
        .where(
          and(
            eq(pins.entityType, 'moodboard'),
            eq(pins.kind, 'favorite'),
            inArray(pins.entityId, ids)
          )
        )
        .all()
        .map((r) => r.id)
    )
    const items = this.db
      .select({ moodboardId: moodboardItems.moodboardId, path: designs.imagePath })
      .from(moodboardItems)
      .innerJoin(designs, eq(designs.id, moodboardItems.designId))
      .where(and(isNull(designs.deletedAt), inArray(moodboardItems.moodboardId, ids)))
      .orderBy(asc(moodboardItems.position))
      .all()
    const holding = opts.designId
      ? new Set(
          this.db
            .select({ id: moodboardItems.moodboardId })
            .from(moodboardItems)
            .where(eq(moodboardItems.designId, opts.designId))
            .all()
            .map((r) => r.id)
        )
      : null
    return list.map((b) => {
      const mine = items.filter((i) => i.moodboardId === b.id)
      return {
        ...b,
        ...(holding ? { contains: holding.has(b.id) } : {}),
        favorite: favorites.has(b.id),
        itemCount: mine.length,
        previewPaths: mine
          .map((i) => i.path)
          .filter((p): p is string => !!p)
          .slice(0, 4)
      }
    })
  }

  moodboardsApi(): MoodboardsApi {
    const repo = this.moodboardRepo
    const one = (id: string): Moodboard => {
      const found = this.moodboardSummaries({ ids: [id] })[0]
      if (!found) throw new NotFoundError('Добірка', id)
      return found
    }
    return {
      list: async (query) => this.moodboardSummaries(moodboardListQuerySchema.parse(query ?? {})),
      count: async () =>
        this.db.select({ n: count() }).from(moodboards).where(isNull(moodboards.deletedAt)).get()
          ?.n ?? 0,
      get: async (id) => this.moodboardSummaries({ ids: [idArg.parse(id)] })[0] ?? null,
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
        const board = this.moodboardSummaries({ ids: [idArg.parse(id)] })[0]
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
        const { moodboardId, designIds } = z
          .object({ moodboardId: idArg, designIds: orderedIds })
          .parse(args)
        repo.rowOrThrow(moodboardId)
        let pos = nextPosition(
          this.m.db,
          moodboardItems.position,
          eq(moodboardItems.moodboardId, moodboardId)
        )
        this.m.db.tx(() => {
          for (const designId of designIds) {
            this.db
              .insert(moodboardItems)
              .values({ moodboardId, designId, position: pos++ })
              .onConflictDoNothing()
              .run()
          }
        })
        repo.touch(moodboardId)
      },
      removeDesign: async (args) => {
        const { moodboardId, designId } = z
          .object({ moodboardId: idArg, designId: idArg })
          .parse(args)
        this.db
          .delete(moodboardItems)
          .where(
            and(eq(moodboardItems.moodboardId, moodboardId), eq(moodboardItems.designId, designId))
          )
          .run()
        repo.touch(moodboardId)
      },
      reorder: async (args) => {
        const { moodboardId, designIds } = z
          .object({ moodboardId: idArg, designIds: orderedIds })
          .parse(args)
        reorder(
          this.m.db,
          moodboardItems,
          moodboardItems.designId,
          designIds,
          eq(moodboardItems.moodboardId, moodboardId)
        )
      }
    }
  }
}
