/**
 * Text-first knowledge modules: Claude notes, JS libraries, snippets, errors & fixes, bookmarks.
 * Each is a descriptor + repository + declarative CRUD API.
 */
import { eq, sql } from 'drizzle-orm'
import type { BookmarksApi, ClaudeApi, FixesApi, LibrariesApi, SnippetsApi } from '@shared/api'
import {
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
import type { NotesApi } from '@shared/api'
import { and, isNull } from 'drizzle-orm'
import { SoftRepository } from '../core/soft-repository'
import type { EntityDescriptor } from '../core/registry'
import { now } from '../core/util'
import { idArg, type ModuleContext } from './context'
import { createCrudApi } from './crud'

const CLAUDE_LABEL: Record<ClaudeKind, string> = {
  note: 'Нотатка',
  branch: 'Гілка',
  skill: 'Скіл',
  plugin: 'Плагін',
  guide: 'Гайд',
  prompt: 'Промт'
}

const LIB_STATUS_LABEL: Record<LibraryStatus, string> = {
  used: 'Використовував',
  favorite: 'Улюблена',
  want: 'Хочу спробувати',
  testing: 'Пробую',
  dropped: 'Не зайшла'
}

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
      summary: (r) => ({ title: r.title, subtitle: CLAUDE_LABEL[r.kind as ClaudeKind] }),
      systemFields: ['copyCount']
    }
    const library: EntityDescriptor = {
      type: 'library',
      table: libraries,
      draft: { titleField: 'name', contentFields: ['purpose', 'notes', 'npmUrl', 'githubUrl', 'docsUrl', 'installCmd'] },
      searchDoc: (r) => ({ title: r.name, body: `${r.purpose}\n${r.installCmd}\n${r.notes}` }),
      summary: (r) => ({
        title: r.name,
        subtitle: r.purpose || LIB_STATUS_LABEL[r.status as LibraryStatus]
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
        where: (q) => [
          q.kind ? eq(claudeItems.kind, q.kind) : undefined,
          repo.hasTag(q.tagId),
          repo.matches(q.search, [claudeItems.title, claudeItems.summary, claudeItems.content])
        ],
        orderBy: [sql`${claudeItems.works} DESC`, sql`${claudeItems.updatedAt} DESC`]
      }),
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
    return createCrudApi<
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
      where: (q) => [
        q.status ? eq(libraries.status, q.status) : undefined,
        repo.hasTag(q.tagId),
        repo.matches(q.search, [libraries.name, libraries.purpose, libraries.notes])
      ],
      orderBy: [sql`ulower(${libraries.name}) ASC`]
    })
  }

  snippetsApi(): SnippetsApi {
    const repo = this.snippetRepo
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
        where: (q) => [
          q.language ? eq(snippets.language, q.language) : undefined,
          repo.hasTag(q.tagId),
          repo.matches(q.search, [snippets.title, snippets.description, snippets.code])
        ]
      }),
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
    return createCrudApi<typeof fixes.$inferSelect, Fix, FixInput, FixPatch, FixListQuery>({
      repo,
      input: fixInputSchema,
      patch: fixPatchSchema,
      query: fixListQuerySchema,
      where: (q) => [
        q.resolved === undefined ? undefined : eq(fixes.resolved, q.resolved),
        repo.hasTag(q.tagId),
        repo.matches(q.search, [fixes.title, fixes.errorText, fixes.solution, fixes.context])
      ]
    })
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
          .sort((a, b) => a.localeCompare(b, 'uk'))
    }
  }

  bookmarksApi(): BookmarksApi {
    const repo = this.bookmarkRepo
    return createCrudApi<
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
        repo.hasTag(q.tagId),
        repo.matches(q.search, [bookmarks.title, bookmarks.url, bookmarks.notes])
      ],
      beforeWrite: (data, current) => {
        if (data.status === undefined) return data
        const wasDone = current?.status === 'done'
        if (data.status === 'done' && !wasDone) return { ...data, finishedAt: now(), progress: 100 }
        if (data.status !== 'done' && wasDone) return { ...data, finishedAt: null }
        return data
      }
    })
  }
}

export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
