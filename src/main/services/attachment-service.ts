import { shell } from 'electron'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { FilesApi } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import { entityRefSchema, idSchema, type EntityRef } from '@shared/domain/common'
import { fileSourceSchema, type FileSource } from '@shared/domain/designs'
import type { Attachment } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { attachments } from '../db/schema'
import { newId, now, NotFoundError } from '../core/util'
import { openPathOrThrow } from '../core/open-path'
import type { EntityRegistry } from '../core/registry'
import type { FileStorage } from './file-storage'

/** Why a stored file didn't open (shell's English error goes to the log through openPathOrThrow). */
const FILE_OPEN_ERROR = 'Не вдалося відкрити файл — можливо, його видалено або перейменовано'

/** Files attached to any entity. */
export class AttachmentService {
  constructor(
    private readonly ctx: DbContext,
    private readonly storage: FileStorage,
    private readonly registry: EntityRegistry
  ) {}

  list(ref: EntityRef): Attachment[] {
    return this.ctx.orm
      .select()
      .from(attachments)
      .where(and(eq(attachments.entityType, ref.type), eq(attachments.entityId, ref.id)))
      .orderBy(asc(attachments.createdAt))
      .all() as Attachment[]
  }

  async add(ref: EntityRef, source: FileSource): Promise<Attachment> {
    // A file for a deleted record would be copied into <data>/files (up to 300 MB) with nothing to clean it up.
    if (!this.registry.findRow(ref)) throw new NotFoundError(ref.type, ref.id)
    const stored = await this.storage.import(source)
    const row = {
      id: newId(),
      entityType: ref.type,
      entityId: ref.id,
      path: stored.path,
      originalName: stored.originalName,
      mime: stored.mime,
      size: stored.size,
      createdAt: now()
    }
    this.ctx.orm.insert(attachments).values(row).run()
    return row as Attachment & { entityType: EntityType }
  }

  private find(id: string): Attachment {
    const row = this.ctx.orm.select().from(attachments).where(eq(attachments.id, id)).get()
    if (!row) throw new NotFoundError('Файл', id)
    return row as Attachment
  }

  remove(id: string): void {
    const row = this.find(id)
    this.ctx.orm.delete(attachments).where(eq(attachments.id, id)).run()
    this.storage.remove(row.path)
  }

  async open(id: string): Promise<void> {
    await openPathOrThrow(this.storage.resolve(this.find(id).path), FILE_OPEN_ERROR)
  }

  reveal(id: string): void {
    shell.showItemInFolder(this.storage.resolve(this.find(id).path))
  }

  clearFor(ref: EntityRef): void {
    for (const a of this.list(ref)) {
      this.storage.remove(a.path)
    }
    this.ctx.orm
      .delete(attachments)
      .where(and(eq(attachments.entityType, ref.type), eq(attachments.entityId, ref.id)))
      .run()
  }

  api(): FilesApi {
    return {
      list: async (ref) => this.list(entityRefSchema.parse(ref)),
      add: async (args) => {
        const { ref, source } = z
          .object({ ref: entityRefSchema, source: fileSourceSchema })
          .parse(args)
        return this.add(ref, source)
      },
      remove: async (id) => this.remove(idSchema.parse(id)),
      open: async (id) => this.open(idSchema.parse(id)),
      reveal: async (id) => this.reveal(idSchema.parse(id)),
      // storage.resolve() throws for anything outside <data>/files, so only stored files can be opened.
      openPath: async (path) =>
        openPathOrThrow(
          this.storage.resolve(z.string().min(1).max(1000).parse(path)),
          FILE_OPEN_ERROR
        ),
      clipboardHasImage: async () => this.storage.clipboardHasImage()
    }
  }
}
