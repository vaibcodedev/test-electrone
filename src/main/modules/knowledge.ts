/**
 * Text-first knowledge modules: Claude notes, JS libraries, snippets, errors & fixes, bookmarks.
 * Each is a descriptor + repository + declarative CRUD API.
 */
import { and, desc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type {
  BookmarksApi,
  ClaudeApi,
  CopiedItem,
  FixesApi,
  KnowledgeApi,
  LibrariesApi,
  NotesApi,
  SnippetsApi
} from '@shared/api'
import { chipCountsQuerySchema, type ChipCountsQuery } from '@shared/domain/common'
import { hostOf } from '@shared/url'
import {
  CLAUDE_KIND_LABEL,
  claudeInputSchema,
  claudeListQuerySchema,
  claudePatchSchema,
  type ClaudeInput,
  type ClaudeItem,
  type ClaudeKind,
  type ClaudeListQuery,
  type ClaudePatch
} from '@shared/domain/claude'
import {
  LIBRARY_STATUS_LABEL,
  libraryInputSchema,
  libraryListQuerySchema,
  libraryPatchSchema,
  type Library,
  type LibraryInput,
  type LibraryListQuery,
  type LibraryPatch,
  type LibraryStatus
} from '@shared/domain/libraries'
import {
  snippetInputSchema,
  snippetListQuerySchema,
  snippetPatchSchema,
  type Snippet,
  type SnippetInput,
  type SnippetLanguage,
  type SnippetListQuery,
  type SnippetPatch
} from '@shared/domain/snippets'
import {
  fixInputSchema,
  fixListQuerySchema,
  fixPatchSchema,
  type Fix,
  type FixInput,
  type FixListQuery,
  type FixPatch
} from '@shared/domain/fixes'
import {
  bookmarkInputSchema,
  bookmarkListQuerySchema,
  bookmarkPatchSchema,
  type Bookmark,
  type BookmarkInput,
  type BookmarkKind,
  type BookmarkListQuery,
  type BookmarkPatch,
  type BookmarkStatus
} from '@shared/domain/bookmarks'
import { bookmarks, claudeItems, fixes, libraries, notes, snippets } from '../db/schema'
import {
  noteInputSchema,
  noteListQuerySchema,
  notePatchSchema,
  type Note,
  type NoteInput,
  type NoteListQuery,
  type NotePatch
} from '@shared/domain/notes'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { now } from '../core/util'
import { idArg, type ModuleContext } from './context'
import { createCrudApi } from './crud'

export class KnowledgeModule {
  readonly descriptors: EntityDescriptor[]
  private readonly claudeRepo: SoftRepository<typeof claudeItems.$inferSelect, ClaudeItem>
  private readonly libraryRepo: SoftRepository<typeof libraries.$inferSelect, Library>
  private readonly snippetRepo: SoftRepository<typeof snippets.$inferSelect, Snippet>
  private readonly fixRepo: SoftRepository<typeof fixes.$inferSelect, Fix>
  readonly bookmarkRepo: SoftRepository<typeof bookmarks.$inferSelect, Bookmark>
  private readonly noteRepo: SoftRepository<typeof notes.$inferSelect, Note>

  constructor(private readonly m: ModuleContext) {
    const claude: EntityDescriptor = {
      type: 'claude',
      table: claudeItems,
      draft: { titleField: 'title', contentFields: ['summary', 'content', 'url'] },
      searchDoc: (r) => ({ title: r.title, body: `${r.summary}\n${r.content}` }),
      summary: (r) => ({ title: r.title, subtitle: CLAUDE_KIND_LABEL[r.kind as ClaudeKind] }),
      systemFields: ['copyCount']
    }
    const library: EntityDescriptor = {
      type: 'library',
      table: libraries,
      draft: {
        titleField: 'name',
        contentFields: ['purpose', 'notes', 'npmUrl', 'githubUrl', 'docsUrl', 'installCmd']
      },
      searchDoc: (r) => ({ title: r.name, body: `${r.purpose}\n${r.installCmd}\n${r.notes}` }),
      summary: (r) => ({
        title: r.name,
        subtitle: r.purpose || LIBRARY_STATUS_LABEL[r.status as LibraryStatus]
      })
    }
    const snippet: EntityDescriptor = {
      type: 'snippet',
      table: snippets,
      draft: { titleField: 'title', contentFields: ['description', 'code'] },
      searchDoc: (r) => ({ title: r.title, body: `${r.description}\n${r.code}` }),
      summary: (r) => ({ title: r.title, subtitle: r.language }),
      systemFields: ['copyCount']
    }
    const fix: EntityDescriptor = {
      type: 'fix',
      table: fixes,
      draft: { titleField: 'title', contentFields: ['errorText', 'cause', 'solution', 'context'] },
      searchDoc: (r) => ({
        title: r.title,
        body: `${r.errorText}\n${r.cause}\n${r.solution}\n${r.context}`
      }),
      summary: (r) => ({ title: r.title, subtitle: r.context || undefined })
    }
    const bookmark: EntityDescriptor = {
      type: 'bookmark',
      table: bookmarks,
      draft: { titleField: 'title', contentFields: ['url', 'notes'] },
      searchDoc: (r) => ({ title: r.title, body: `${r.url}\n${r.notes}` }),
      summary: (r) => ({ title: r.title, subtitle: hostOf(r.url) })
    }
    const note: EntityDescriptor = {
      type: 'note',
      table: notes,
      draft: { titleField: 'title', contentFields: ['body'] },
      searchDoc: (r) => ({ title: r.title, body: `${r.folder}\n${r.body}` }),
      summary: (r) => ({ title: r.title, subtitle: r.folder || undefined })
    }
    this.descriptors = [claude, library, snippet, fix, bookmark, note]
    this.noteRepo = new SoftRepository(m.repo, note, (r, tags) => ({ ...r, tags }))

    this.claudeRepo = new SoftRepository(m.repo, claude, (r, tags) => ({
      ...r,
      kind: r.kind as ClaudeKind,
      tags
    }))
    this.libraryRepo = new SoftRepository(m.repo, library, (r, tags) => ({
      ...r,
      status: r.status as LibraryStatus,
      tags
    }))
    this.snippetRepo = new SoftRepository(m.repo, snippet, (r, tags) => ({
      ...r,
      language: r.language as SnippetLanguage,
      tags
    }))
    this.fixRepo = new SoftRepository(m.repo, fix, (r, tags) => ({ ...r, tags }))
    this.bookmarkRepo = new SoftRepository(m.repo, bookmark, (r, tags) => ({
      ...r,
      kind: r.kind as BookmarkKind,
      status: r.status as BookmarkStatus,
      tags
    }))
  }

  claudeApi(): ClaudeApi {
    const repo = this.claudeRepo
    const filters = (q: ChipCountsQuery): (SQL | undefined)[] => [
      repo.hasTag(q.tagId),
      repo.onlyFavorites(q.favorite),
      repo.matches(q.search, [claudeItems.title, claudeItems.summary, claudeItems.content])
    ]
    return {
      ...createCrudApi<
        typeof claudeItems.$inferSelect,
        ClaudeItem,
        ClaudeInput,
        ClaudePatch,
        ClaudeListQuery
      >({
        repo,
        input: claudeInputSchema,
        patch: claudePatchSchema,
        query: claudeListQuerySchema,
        where: (q) => [q.kind ? eq(claudeItems.kind, q.kind) : undefined, ...filters(q)],
        orderBy: [sql`${claudeItems.works} DESC`, sql`${claudeItems.updatedAt} DESC`]
      }),
      counts: async (query) =>
        repo.countBy(claudeItems.kind, filters(chipCountsQuerySchema.parse(query ?? {}))),
      markCopied: async (id) => {
        this.m.db.orm
          .update(claudeItems)
          .set({ copyCount: sql`${claudeItems.copyCount} + 1` })
          .where(eq(claudeItems.id, idArg.parse(id)))
          .run()
      }
    }
  }

  librariesApi(): LibrariesApi {
    const repo = this.libraryRepo
    const filters = (q: ChipCountsQuery): (SQL | undefined)[] => [
      repo.hasTag(q.tagId),
      repo.onlyFavorites(q.favorite),
      repo.matches(q.search, [libraries.name, libraries.purpose, libraries.notes])
    ]
    return {
      ...createCrudApi<
        typeof libraries.$inferSelect,
        Library,
        LibraryInput,
        LibraryPatch,
        LibraryListQuery
      >({
        repo,
        input: libraryInputSchema,
        patch: libraryPatchSchema,
        query: libraryListQuerySchema,
        where: (q) => [q.status ? eq(libraries.status, q.status) : undefined, ...filters(q)],
        orderBy: [sql`ulower(${libraries.name}) ASC`]
      }),
      counts: async (query) =>
        repo.countBy(libraries.status, filters(chipCountsQuerySchema.parse(query ?? {})))
    }
  }

  snippetsApi(): SnippetsApi {
    const repo = this.snippetRepo
    const filters = (q: ChipCountsQuery): (SQL | undefined)[] => [
      repo.hasTag(q.tagId),
      repo.onlyFavorites(q.favorite),
      repo.matches(q.search, [snippets.title, snippets.description, snippets.code])
    ]
    return {
      ...createCrudApi<
        typeof snippets.$inferSelect,
        Snippet,
        SnippetInput,
        SnippetPatch,
        SnippetListQuery
      >({
        repo,
        input: snippetInputSchema,
        patch: snippetPatchSchema,
        query: snippetListQuerySchema,
        where: (q) => [q.language ? eq(snippets.language, q.language) : undefined, ...filters(q)]
      }),
      counts: async (query) =>
        repo.countBy(snippets.language, filters(chipCountsQuerySchema.parse(query ?? {}))),
      markCopied: async (id) => {
        this.m.db.orm
          .update(snippets)
          .set({ copyCount: sql`${snippets.copyCount} + 1` })
          .where(eq(snippets.id, idArg.parse(id)))
          .run()
      }
    }
  }

  fixesApi(): FixesApi {
    const repo = this.fixRepo
    const filters = (q: ChipCountsQuery): (SQL | undefined)[] => [
      repo.hasTag(q.tagId),
      repo.onlyFavorites(q.favorite),
      repo.matches(q.search, [fixes.title, fixes.errorText, fixes.solution, fixes.context])
    ]
    return {
      ...createCrudApi<typeof fixes.$inferSelect, Fix, FixInput, FixPatch, FixListQuery>({
        repo,
        input: fixInputSchema,
        patch: fixPatchSchema,
        query: fixListQuerySchema,
        where: (q) => [
          q.resolved === undefined ? undefined : eq(fixes.resolved, q.resolved),
          ...filters(q)
        ]
      }),
      counts: async (query) => {
        const by = repo.countBy(fixes.resolved, filters(chipCountsQuerySchema.parse(query ?? {})))
        return { open: by['false'] ?? 0, resolved: by['true'] ?? 0 }
      }
    }
  }

  notesApi(): NotesApi {
    const repo = this.noteRepo
    return {
      ...createCrudApi<typeof notes.$inferSelect, Note, NoteInput, NotePatch, NoteListQuery>({
        repo,
        input: noteInputSchema,
        patch: notePatchSchema,
        query: noteListQuerySchema,
        where: (q) => [
          q.folder !== undefined ? eq(notes.folder, q.folder) : undefined,
          repo.hasTag(q.tagId),
          repo.onlyFavorites(q.favorite),
          repo.matches(q.search, [notes.title, notes.body])
        ]
      }),
      folders: async () =>
        this.m.db.orm
          .selectDistinct({ folder: notes.folder })
          .from(notes)
          .where(and(isNull(notes.deletedAt), sql`${notes.folder} != ''`))
          .all()
          .map((r) => r.folder)
          .sort((a, b) => a.localeCompare(b, 'uk')),
      folderCounts: async (query) => {
        const q = chipCountsQuerySchema.parse(query ?? {})
        const where = [
          repo.hasTag(q.tagId),
          repo.onlyFavorites(q.favorite),
          repo.matches(q.search, [notes.title, notes.body])
        ]
        return Object.entries(repo.countBy(notes.folder, where))
          .map(([folder, count]) => ({ folder, count }))
          .sort((a, b) => a.folder.localeCompare(b.folder, 'uk'))
      }
    }
  }

  bookmarksApi(): BookmarksApi {
    const repo = this.bookmarkRepo
    const filters = (q: ChipCountsQuery): (SQL | undefined)[] => [
      repo.hasTag(q.tagId),
      repo.onlyFavorites(q.favorite),
      repo.matches(q.search, [bookmarks.title, bookmarks.url, bookmarks.notes])
    ]
    return {
      ...createCrudApi<
        typeof bookmarks.$inferSelect,
        Bookmark,
        BookmarkInput,
        BookmarkPatch,
        BookmarkListQuery
      >({
        repo,
        input: bookmarkInputSchema,
        patch: bookmarkPatchSchema,
        query: bookmarkListQuerySchema,
        where: (q) => [
          q.kind ? eq(bookmarks.kind, q.kind) : undefined,
          q.status ? eq(bookmarks.status, q.status) : undefined,
          ...filters(q)
        ],
        beforeWrite: (data, current) => {
          if (data.status === undefined) return data
          const wasDone = current?.status === 'done'
          if (data.status === 'done' && !wasDone)
            return { ...data, finishedAt: now(), progress: 100 }
          if (data.status !== 'done' && wasDone) return { ...data, finishedAt: null }
          return data
        }
      }),
      counts: async (query) => {
        const q = chipCountsQuerySchema
          .extend({ kind: bookmarkListQuerySchema.shape.kind })
          .parse(query ?? {})
        return {
          byStatus: repo.countBy(bookmarks.status, [
            q.kind ? eq(bookmarks.kind, q.kind) : undefined,
            ...filters(q)
          ]),
          byKind: repo.countBy(bookmarks.kind, filters(q))
        }
      }
    }
  }

  /** «Часто копіюю»: copy counters of snippets and prompts, without their code and text. */
  knowledgeApi(): KnowledgeApi {
    return {
      mostCopied: async (limit) => {
        const n = z.number().int().min(1).max(20).optional().parse(limit) ?? 7
        const db = this.m.db.orm
        const top: CopiedItem[] = [
          ...db
            .select({
              id: snippets.id,
              title: snippets.title,
              sub: snippets.language,
              count: snippets.copyCount
            })
            .from(snippets)
            .where(and(isNull(snippets.deletedAt), gt(snippets.copyCount, 0)))
            .orderBy(desc(snippets.copyCount))
            .limit(n)
            .all()
            .map((r) => ({ ...r, type: 'snippet' as const })),
          ...db
            .select({ id: claudeItems.id, title: claudeItems.title, count: claudeItems.copyCount })
            .from(claudeItems)
            .where(
              and(
                isNull(claudeItems.deletedAt),
                eq(claudeItems.kind, 'prompt'),
                gt(claudeItems.copyCount, 0)
              )
            )
            .orderBy(desc(claudeItems.copyCount))
            .limit(n)
            .all()
            .map((r) => ({ ...r, type: 'claude' as const, sub: CLAUDE_KIND_LABEL.prompt }))
        ]
        return top.sort((a, b) => b.count - a.count).slice(0, n)
      }
    }
  }
}
