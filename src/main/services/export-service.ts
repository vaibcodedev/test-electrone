import { app, BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { AsyncZippable } from 'fflate'
import { zipAsync } from '../core/zip'
import { getTableName, isTable } from 'drizzle-orm'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import type { ExportFormat } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import * as schema from '../db/schema'
import type { AppPaths } from '../core/paths'
import type { AnyRow, EntityRegistry } from '../core/registry'
import type { TagService } from './tag-service'
import type { LinkService } from './link-service'
import { collectFiles } from './backup-service'
import { dayKey, now, slugify } from '../core/util'
import { fmtDateTime } from '@shared/dates'
import { markdownLink, refKey, replaceWikiLinks } from '@shared/wikilinks'

const enc = new TextEncoder()

/** Fields that stay out of the markdown body/frontmatter; each type adds its own `systemFields`. */
const HIDDEN = new Set(['deletedAt', 'secret', 'secrets'])

function yamlValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.map((x) => yamlValue(x)).join(', ')}]`
  return JSON.stringify(String(v))
}

function iso(ts: unknown): string | null {
  return typeof ts === 'number' && ts > 0 ? new Date(ts).toISOString() : null
}

/** An exported record: its file in the zip and its title. */
interface ExportedFile {
  path: string
  title: string
}

/**
 * Record links in a text («[[», `[Назва](vault:note/<id>)`) as the export writes them: in the body a link to the
 * exported file (every file sits one folder deep, so `../<folder>/<file>.md` — Obsidian and Markdown viewers
 * follow it) under the record's current title; in the frontmatter just the title; a record that isn't exported
 * (in the trash, deleted for good) keeps the label from the text.
 */
function readableLinks(text: string, files: Map<string, ExportedFile>, asLink: boolean): string {
  return replaceWikiLinks(text, (m) => {
    const file = files.get(refKey(m.ref))
    if (!file) return m.label
    return asLink ? markdownLink(file.title, `../${file.path}`) : file.title
  })
}

/** Exports everything so data is never locked inside the app: one JSON file or a zip of Markdown files. */
export class ExportService {
  constructor(
    private readonly ctx: DbContext,
    private readonly paths: AppPaths,
    private readonly registry: EntityRegistry,
    private readonly tags: TagService,
    private readonly links: LinkService
  ) {}

  async export(format: ExportFormat): Promise<string | null> {
    const day = dayKey(Date.now())
    const isJson = format === 'json'
    const res = await dialog.showSaveDialog(
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0],
      {
        title: isJson ? 'Експорт у JSON' : 'Експорт у Markdown',
        defaultPath: join(
          app.getPath('documents'),
          `vault-export-${day}.${isJson ? 'json' : 'zip'}`
        ),
        filters: isJson
          ? [{ name: 'JSON', extensions: ['json'] }]
          : [{ name: 'ZIP', extensions: ['zip'] }]
      }
    )
    if (res.canceled || !res.filePath) return null
    if (isJson) writeFileSync(res.filePath, JSON.stringify(this.json(), null, 2))
    else writeFileSync(res.filePath, await this.markdownZip())
    return res.filePath
  }

  /**
   * Every table, raw. Credential secrets are excluded — the password (`secret`) and the extra ones (`secrets`: 2FA,
   * SSH key…), though both are OS-encrypted anyway; their non-secret fields (host, port…) stay.
   */
  json(): Record<string, unknown> {
    const tables: Record<string, unknown[]> = {}
    for (const value of Object.values(schema)) {
      if (!isTable(value)) continue
      const name = getTableName(value)
      const rows = this.ctx.orm.select().from(value).all() as Record<string, unknown>[]
      tables[name] =
        name === 'credentials'
          ? rows.map((r) => ({ ...r, secret: undefined, secrets: undefined }))
          : rows
    }
    return {
      format: 'vault-export',
      version: 1,
      appVersion: app.getVersion(),
      exportedAt: new Date().toISOString(),
      tables
    }
  }

  private markdownFor(type: EntityType, row: AnyRow, files: Map<string, ExportedFile>): string {
    const d = this.registry.get(type)
    const { title } = d.summary(row)
    const tagNames = (this.tags.forMany(type, [row.id]).get(row.id) ?? []).map((t) => t.name)
    const links = this.links
      .list({ type, id: row.id })
      .map((l) => `${ENTITY_META[l.type].label}: ${l.title}`)
    const front: string[] = [`id: ${row.id}`, `type: ${type}`, `title: ${yamlValue(title)}`]
    const body: string[] = [`# ${title}`, '']
    for (const [key, value] of Object.entries(row)) {
      if (HIDDEN.has(key) || d.systemFields?.includes(key) || key === 'id') continue
      if (key.endsWith('At') && typeof value === 'number') {
        front.push(`${key}: ${yamlValue(iso(value))}`)
      } else if (typeof value === 'string' && (value.includes('\n') || value.length > 120)) {
        const isCode = key === 'code'
        body.push(
          `## ${key}`,
          '',
          isCode
            ? `\`\`\`${row.language ?? ''}\n${value}\n\`\`\``
            : readableLinks(value, files, true),
          ''
        )
      } else if (key.endsWith('Path') && typeof value === 'string') {
        front.push(`${key}: ${yamlValue(value)}`)
        body.push(`![](../files/${value})`, '')
      } else {
        const text = typeof value === 'string' ? readableLinks(value, files, false) : value
        front.push(`${key}: ${yamlValue(text)}`)
      }
    }
    if (tagNames.length) front.push(`tags: ${yamlValue(tagNames)}`)
    if (links.length) body.push('## Зв’язки', '', ...links.map((l) => `- ${l}`), '')
    body.push(...(d.exportBody?.(row) ?? []).map((line) => readableLinks(line, files, true)))
    return `---\n${front.join('\n')}\n---\n\n${body.join('\n')}`
  }

  async markdownZip(): Promise<Uint8Array> {
    const entries: AsyncZippable = {}
    // File names first: a record's text may link to any other record (readableLinks).
    const files = new Map<string, ExportedFile>()
    const records: { type: EntityType; row: AnyRow; path: string }[] = []
    for (const d of this.registry.all()) {
      const rows = this.ctx.orm
        .select()
        .from(d.table)
        .where(this.registry.live(d))
        .all() as AnyRow[]
      const folder = slugify(ENTITY_META[d.type].plural, d.type)
      const used = new Set<string>()
      for (const row of rows) {
        const { title } = d.summary(row)
        let name = slugify(title, d.type)
        while (used.has(name)) name = `${name}-${row.id.slice(0, 4)}`
        used.add(name)
        const path = `${folder}/${name}.md`
        files.set(refKey({ type: d.type, id: row.id }), { path, title })
        records.push({ type: d.type, row, path })
      }
    }
    for (const r of records) entries[r.path] = enc.encode(this.markdownFor(r.type, r.row, files))
    entries['README.md'] = enc.encode(
      `# Vault export\n\nЕкспортовано ${fmtDateTime(now())}.\nКожна папка — модуль, кожен файл — запис із frontmatter. Зображення лежать у files/.\n`
    )
    collectFiles(this.paths.filesDir, 'files', entries)
    return zipAsync(entries, { level: 6 })
  }
}
