import { shell } from 'electron'
import { and, asc, eq } from 'drizzle-orm'
import type { EntityType } from '@shared/entity-types'
import type { EntityRef } from '@shared/domain/common'
import type { FileSource } from '@shared/domain/designs'
import type { Attachment } from '@shared/domain/system'
import type { DbContext } from '../db/client'
import { attachments } from '../db/schema'
import { newId, now, NotFoundError } from '../core/util'
import type { FileStorage } from './file-storage'

/** Files attached to any entity. */
export class AttachmentService {
  constructor(
    private readonly ctx: DbContext,
    private readonly storage: FileStorage
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
    const err = await shell.openPath(this.storage.resolve(this.find(id).path))
    if (err) throw new Error(err)
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
}
