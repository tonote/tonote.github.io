import { db } from './database';
import { assertWritable } from '../state/accessStore';

export interface StoredAttachment { blob: Blob; pending: true }
const keyFor = (id: string) => `attachment:${id}`;

export const attachmentsRepo = {
  async get(id: string): Promise<StoredAttachment | undefined> {
    return (await db.kv.get(keyFor(id)))?.value as StoredAttachment | undefined;
  },
  async put(id: string, blob: Blob): Promise<void> {
    assertWritable();
    await db.kv.put({ key: keyFor(id), value: { blob, pending: true } });
  },
  async delete(id: string): Promise<void> { await db.kv.delete(keyFor(id)); },
};
